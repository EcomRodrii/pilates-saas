-- P0 de auditoría: historial de reservas, liquidaciones inmutables y
-- metadatos de reintento para eventos del webhook Connect.
-- La supresión de una socia la CONSERVA (RGPD), seudonimizada por socio_id;
-- Supresión (RGPD): CONSERVAR. Solo ids internos y estados, nunca contacto.

-- ── Eventos de reserva y asistencia ───────────────────────────────────────
-- Solo se copian estados y referencias internas; nunca nombres, email,
-- comentarios ni datos de pago. El trigger escribe en la misma transacción que
-- el cambio de reserva: si no se puede dejar constancia, el cambio no se aplica.
create table if not exists public.reservas_eventos (
  id          bigint generated always as identity primary key,
  studio_id   text not null,
  reserva_id  text not null,
  sesion_id   text,
  socio_id    text,
  ocurrido_en timestamptz not null default now(),
  operacion   text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  actor_uid   uuid,
  actor_tipo  text not null check (actor_tipo in ('STAFF', 'SOCIA', 'SISTEMA', 'DESCONOCIDO')),
  actor_rol   text,
  origen      text not null check (origen in ('PANEL', 'PORTAL', 'SERVIDOR')),
  antes       jsonb,
  despues     jsonb
);

comment on table public.reservas_eventos is
  'Historial append-only de estado, asistencia y plaza de una reserva. No guarda datos de contacto.';

create index if not exists reservas_eventos_reserva_idx
  on public.reservas_eventos (studio_id, reserva_id, id desc);
create index if not exists reservas_eventos_sesion_idx
  on public.reservas_eventos (studio_id, sesion_id, id desc);
create index if not exists reservas_eventos_socia_idx
  on public.reservas_eventos (studio_id, socio_id, id desc)
  where socio_id is not null;

alter table public.reservas_eventos enable row level security;
revoke all on table public.reservas_eventos from public, anon, authenticated, service_role;
revoke all on sequence public.reservas_eventos_id_seq from public, anon, authenticated, service_role;
grant select on table public.reservas_eventos to authenticated, service_role;

drop policy if exists reservas_eventos_lectura on public.reservas_eventos;
create policy reservas_eventos_lectura on public.reservas_eventos
  for select to authenticated
  using (
    studio_id = (select public.current_studio_id())
    and (
      (select public.current_rol()) in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
      or (
        (select public.current_rol()) = 'INSTRUCTOR'
        and exists (
          select 1
            from public.sesiones s
            join public.instructores i on i.id = s.instructor_id
           where s.id = reservas_eventos.sesion_id
             and s.studio_id = reservas_eventos.studio_id
             and i.auth_user_id = (select auth.uid())
             and coalesce(i.activo, true)
        )
      )
    )
  );

drop policy if exists exige_doble_factor on public.reservas_eventos;
create policy exige_doble_factor on public.reservas_eventos
  as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente()))
  with check ((select public.nivel_acceso_suficiente()));

create or replace function public.reservas_eventos_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'reservas_eventos es inmutable: % no está permitido', tg_op;
end;
$$;
revoke all on function public.reservas_eventos_inmutable() from public, anon, authenticated, service_role;

drop trigger if exists trg_reservas_eventos_inmutable on public.reservas_eventos;
create trigger trg_reservas_eventos_inmutable
  before update or delete on public.reservas_eventos
  for each row execute function public.reservas_eventos_inmutable();
drop trigger if exists trg_reservas_eventos_no_truncate on public.reservas_eventos;
create trigger trg_reservas_eventos_no_truncate
  before truncate on public.reservas_eventos
  for each statement execute function public.reservas_eventos_inmutable();

create or replace function public.registrar_reserva_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila jsonb;
  v_anterior jsonb;
  v_nuevo jsonb;
  v_uid uuid := auth.uid();
  v_rol text;
  v_actor_tipo text := 'SISTEMA';
  v_origen text := 'SERVIDOR';
begin
  if tg_op = 'DELETE' then
    v_fila := to_jsonb(old);
    v_anterior := jsonb_build_object(
      'estado', old.estado,
      'check_in_en', old.check_in_en,
      'spot_id', old.spot_id,
      'posicion_espera', old.posicion_espera
    );
  else
    v_fila := to_jsonb(new);
    v_nuevo := jsonb_build_object(
      'estado', new.estado,
      'check_in_en', new.check_in_en,
      'spot_id', new.spot_id,
      'posicion_espera', new.posicion_espera
    );
    if tg_op = 'UPDATE' then
      v_anterior := jsonb_build_object(
        'estado', old.estado,
        'check_in_en', old.check_in_en,
        'spot_id', old.spot_id,
        'posicion_espera', old.posicion_espera
      );
      if v_anterior is not distinct from v_nuevo then
        return new;
      end if;
    end if;
  end if;

  if v_uid is not null then
    select i.rol into v_rol
      from public.instructores i
     where i.auth_user_id = v_uid
       and i.studio_id = (v_fila ->> 'studio_id')
       and coalesce(i.activo, true)
     order by i.id limit 1;
    if v_rol is null and exists (
      select 1 from public.studios s
       where s.id = (v_fila ->> 'studio_id') and s.owner_auth_user_id = v_uid
    ) then
      v_rol := 'PROPIETARIO';
    end if;
    if v_rol is not null then
      v_actor_tipo := 'STAFF';
      v_origen := 'PANEL';
    elsif exists (
      select 1 from public.socios so
       where so.id = (v_fila ->> 'socio_id')
         and so.studio_id = (v_fila ->> 'studio_id')
         and so.auth_user_id = v_uid
    ) then
      v_actor_tipo := 'SOCIA';
      v_rol := 'SOCIA';
      v_origen := 'PORTAL';
    else
      v_actor_tipo := 'DESCONOCIDO';
    end if;
  end if;

  insert into public.reservas_eventos (
    studio_id, reserva_id, sesion_id, socio_id, operacion,
    actor_uid, actor_tipo, actor_rol, origen, antes, despues
  ) values (
    v_fila ->> 'studio_id', v_fila ->> 'id', v_fila ->> 'sesion_id',
    v_fila ->> 'socio_id', tg_op, v_uid, v_actor_tipo, v_rol, v_origen,
    v_anterior, v_nuevo
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.registrar_reserva_evento() from public, anon, authenticated, service_role;

drop trigger if exists trg_reservas_eventos on public.reservas;
create trigger trg_reservas_eventos
  after insert or delete or update of estado, check_in_en, spot_id, posicion_espera
  on public.reservas
  for each row execute function public.registrar_reserva_evento();

-- El historial usa el mismo seudónimo de socio_id que reservas, que ya se
-- conserva en la supresión de una socia. No replica identidad ni contacto.

-- ── Liquidaciones cerradas ────────────────────────────────────────────────
create or replace function public.liquidacion_instructora_proteger_cierre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado not in ('BORRADOR', 'CONFIRMADA', 'PAGADA')
     or new.estado not in ('BORRADOR', 'CONFIRMADA', 'PAGADA') then
    raise exception 'Estado de liquidación no válido';
  end if;
  if (old.estado = 'BORRADOR' and new.estado not in ('BORRADOR', 'CONFIRMADA'))
     or (old.estado = 'CONFIRMADA' and new.estado not in ('CONFIRMADA', 'PAGADA'))
     or (old.estado = 'PAGADA' and new.estado <> 'PAGADA') then
    raise exception 'Transición de liquidación no permitida: % → %', old.estado, new.estado;
  end if;

  if old.estado <> 'BORRADOR' and (
    new.studio_id is distinct from old.studio_id
    or new.instructor_id is distinct from old.instructor_id
    or new.periodo_anio is distinct from old.periodo_anio
    or new.periodo_mes is distinct from old.periodo_mes
    or new.base_eur is distinct from old.base_eur
    or new.n_clases_propias is distinct from old.n_clases_propias
    or new.variable_propias_eur is distinct from old.variable_propias_eur
    or new.n_clases_sustitucion is distinct from old.n_clases_sustitucion
    or new.variable_sustitucion_eur is distinct from old.variable_sustitucion_eur
    or new.n_penalizaciones is distinct from old.n_penalizaciones
    or new.reparto_penalizaciones_eur is distinct from old.reparto_penalizaciones_eur
    or new.n_clases_sin_tarifa is distinct from old.n_clases_sin_tarifa
    or new.detalle is distinct from old.detalle
    or new.modo is distinct from old.modo
    or new.minutos_fichados is distinct from old.minutos_fichados
    or new.jornadas_sin_cerrar is distinct from old.jornadas_sin_cerrar
    or new.relacion_laboral is distinct from old.relacion_laboral
    or new.clases_sin_confirmar is distinct from old.clases_sin_confirmar
    or new.clases_no_dadas is distinct from old.clases_no_dadas
    or new.minutos_retraso is distinct from old.minutos_retraso
    or new.minutos_contrato is distinct from old.minutos_contrato
    or new.minutos_extra is distinct from old.minutos_extra
  ) then
    raise exception 'No se pueden modificar importes ni cálculo de una liquidación %', old.estado;
  end if;

  return new;
end;
$$;
revoke all on function public.liquidacion_instructora_proteger_cierre() from public, anon, authenticated, service_role;
drop trigger if exists trg_liquidacion_instructora_proteger_cierre on public.liquidaciones_instructoras;
create trigger trg_liquidacion_instructora_proteger_cierre
  before update on public.liquidaciones_instructoras
  for each row execute function public.liquidacion_instructora_proteger_cierre();

-- ── Reproceso limitado de webhook Connect ─────────────────────────────────
alter table public.webhook_events
  add column if not exists stripe_account_id text,
  add column if not exists reprocesos integer not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.webhook_events'::regclass
       and conname = 'webhook_events_reprocesos_no_negativos'
  ) then
    alter table public.webhook_events
      add constraint webhook_events_reprocesos_no_negativos check (reprocesos >= 0);
  end if;
end $$;

-- La RPC de reclamación existente no cambia de firma: la app en producción
-- puede seguir reclamando eventos durante el rollout. La cuenta se adjunta
-- con una operación adicional y solo a la fila que esa entrega tiene en curso.
create or replace function public.guardar_cuenta_stripe_webhook(p_event_id text, p_stripe_account_id text)
returns void
language sql
security definer
set search_path = 'public', 'pg_temp'
as $function$
  update public.webhook_events
     set stripe_account_id = p_stripe_account_id
   where id = p_event_id and estado = 'procesando';
$function$;
revoke all on function public.guardar_cuenta_stripe_webhook(text, text) from public, anon, authenticated;
grant execute on function public.guardar_cuenta_stripe_webhook(text, text) to service_role, postgres;

create or replace function public.fallar_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path = 'public', 'pg_temp'
as $function$
  update public.webhook_events
     set estado = 'fallido', reclamado_en = now()
   where id = p_event_id and estado = 'procesando';
$function$;
revoke all on function public.fallar_webhook_event(text) from public, anon, authenticated;
grant execute on function public.fallar_webhook_event(text) to service_role, postgres;

create or replace function public.incrementar_reprocesos_webhook(p_event_id text)
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_reprocesos integer;
begin
  update public.webhook_events
     set reprocesos = reprocesos + 1
   where id = p_event_id
     and id like 'connect:evt\_%' escape '\'
     and estado = 'procesando'
  returning reprocesos into v_reprocesos;
  return v_reprocesos;
end;
$function$;
revoke all on function public.incrementar_reprocesos_webhook(text) from public, anon, authenticated;
grant execute on function public.incrementar_reprocesos_webhook(text) to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.registrar_reserva_evento()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.registrar_reserva_evento()', 'EXECUTE')
     or has_function_privilege('anon', 'public.incrementar_reprocesos_webhook(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.incrementar_reprocesos_webhook(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.guardar_cuenta_stripe_webhook(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guardar_cuenta_stripe_webhook(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.liquidacion_instructora_proteger_cierre()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.liquidacion_instructora_proteger_cierre()', 'EXECUTE') then
    raise exception 'Una función de trigger/reproceso quedó ejecutable por un rol de cliente';
  end if;
  if not has_function_privilege('service_role', 'public.guardar_cuenta_stripe_webhook(text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.incrementar_reprocesos_webhook(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fallar_webhook_event(text)', 'EXECUTE') then
    raise exception 'service_role no tiene EXECUTE sobre las funciones necesarias para reprocesar webhooks';
  end if;
  if not exists (
    select 1 from pg_policy p
    where p.polrelid = 'public.reservas_eventos'::regclass
      and p.polname = 'exige_doble_factor' and not p.polpermissive
  ) then
    raise exception 'reservas_eventos no tiene la política restrictiva exige_doble_factor';
  end if;
end $$;
