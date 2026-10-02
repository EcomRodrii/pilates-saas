-- ─────────────────────────────────────────────────────────────────────────────
-- Ledger de derechos (sesiones de bono y recuperaciones). FASE 1, EN SOMBRA.
--
-- Hasta hoy el saldo de un bono era un contador (`suscripciones.sesiones_restantes`)
-- y la única huella de un consumo era una marca por reserva. Sin movimientos no se
-- podía responder «¿por qué esta alumna tiene 4 sesiones?», ni distinguir un bono
-- gastado de una reserva cubierta por cuota, ni saber qué devolver al cancelar. De
-- ahí salen los defectos de saldo que se corrigen en la fase siguiente.
--
-- Esta migración AÑADE el ledger y NO CAMBIA NINGÚN COMPORTAMIENTO:
--   · una tabla de movimientos, solo de inserción;
--   · dos triggers (sobre `suscripciones.sesiones_restantes` y sobre `recuperaciones`)
--     que anotan CUALQUIER cambio de saldo, lo haga quien lo haga: así el ledger es
--     completo por construcción y suma exactamente el saldo, incluso para los
--     caminos antiguos que escriben a mano;
--   · las funciones del motor (consumir, devolver, renovar) dicen por qué mueven el
--     saldo mediante un contexto de transacción, y los cambios sin contexto quedan
--     como `AJUSTE_SIN_CONTEXTO` (que además descubre qué caminos tocan el saldo sin
--     pasar por el motor);
--   · el saldo de apertura de lo que ya existe, calculado por diferencia;
--   · una vista de conciliación (saldo frente a suma de movimientos);
--   · `CHECK (sesiones_restantes >= 0)`: hoy no hay ningún saldo negativo.
--
-- ⚠️ EN SOMBRA = el ledger NUNCA puede tumbar una reserva ni una devolución. Cada
-- trigger envuelve su escritura en un bloque que, si falla, avisa y sigue. Si algún
-- día falla, la vista de conciliación lo enseña; lo que no puede pasar es que una
-- clienta se quede sin poder reservar por culpa del libro de contabilidad.
--
-- No hay índices únicos todavía a propósito: se añaden cuando el motor único de
-- devoluciones sea la única salida y la sombra haya demostrado que no choca con nada.
-- ─────────────────────────────────────────────────────────────────────────────

-- Sin escrituras concurrentes mientras se reparte la apertura y se enganchan los
-- triggers (milisegundos): un cambio de saldo entre medias se perdería del ledger.
lock table public.suscripciones in share row exclusive mode;
lock table public.recuperaciones in share row exclusive mode;

-- 1. La tabla ────────────────────────────────────────────────────────────────

create table public.movimientos_derecho (
  id            uuid primary key default gen_random_uuid(),
  studio_id     text not null references public.studios(id) on delete cascade,
  socio_id      text,
  derecho_tipo  text not null check (derecho_tipo in ('SUSCRIPCION', 'RECUPERACION', 'NINGUNO')),
  derecho_id    text,
  tipo          text not null check (tipo in (
    'APERTURA', 'COMPRA', 'RENOVACION', 'CONSUMO_BONO', 'DEVOLUCION_BONO', 'REVERSION_VENTA',
    'AJUSTE_SIN_CONTEXTO', 'USO_CUOTA', 'SIN_COBERTURA',
    'CONCESION_RECUPERACION', 'USO_RECUPERACION', 'RESTITUCION_RECUPERACION', 'CADUCIDAD_RECUPERACION'
  )),
  delta         integer not null,
  saldo_despues integer,
  reserva_id    text,
  recibo_id     text,
  actor_tipo    text not null default 'sistema' check (actor_tipo in ('socia', 'staff', 'sistema', 'webhook')),
  actor_id      text,
  motivo        text,
  contexto      jsonb not null default '{}'::jsonb,
  creado_en     timestamptz not null default now(),
  constraint movimientos_derecho_derecho_coherente check ((derecho_tipo = 'NINGUNO') = (derecho_id is null))
);

comment on table public.movimientos_derecho is
  'Ledger de derechos: cada cambio de saldo de un bono o de una recuperación, solo de inserción. saldo = suma de delta. Lo escriben los triggers de suscripciones y recuperaciones y las funciones del motor; nadie desde el navegador.';

create index movimientos_derecho_por_derecho on public.movimientos_derecho (derecho_tipo, derecho_id, creado_en);
create index movimientos_derecho_por_reserva on public.movimientos_derecho (reserva_id) where reserva_id is not null;
create index movimientos_derecho_por_estudio on public.movimientos_derecho (studio_id, creado_en desc);
create index movimientos_derecho_sin_contexto on public.movimientos_derecho (studio_id, creado_en desc) where tipo = 'AJUSTE_SIN_CONTEXTO';

-- RLS cerrada: solo lectura del personal que ve las finanzas, y solo de su estudio.
-- Escribir, nadie: ni INSERT, ni UPDATE, ni DELETE para `authenticated` ni `anon`.
alter table public.movimientos_derecho enable row level security;

create policy movimientos_derecho_lectura on public.movimientos_derecho
  for select to authenticated
  using (studio_id = public.current_studio_id() and public.puede_ver_finanzas());

revoke all on public.movimientos_derecho from anon, authenticated;
grant select on public.movimientos_derecho to authenticated;

-- Solo de inserción: un movimiento no se corrige, se compensa con otro. (DELETE queda
-- permitido al servidor porque el borrado en cascada de un estudio lo necesita.)
create or replace function public.movimientos_derecho_inmutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  raise exception 'movimientos_derecho: el ledger es solo de inserción, un movimiento no se modifica';
end;
$fn$;

revoke all on function public.movimientos_derecho_inmutable() from public, anon, authenticated;

create trigger trg_movimientos_derecho_inmutable
  before update on public.movimientos_derecho
  for each row execute function public.movimientos_derecho_inmutable();

-- 2. Triggers: el ledger suma EXACTAMENTE el saldo, lo escriba quien lo escriba ───

-- El contexto lo pone la función del motor que mueve el saldo, dentro de su transacción:
--   perform set_config('tentare.ledger', '{"tipo":"CONSUMO_BONO","reserva_id":"…"}', true);
-- y lo limpia justo después de su UPDATE para que no se pegue a nada más.
create or replace function public.ledger_suscripcion_saldo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ctx jsonb;
  v_viejo int;
  v_nuevo int;
  v_delta int;
  v_tipo text;
begin
  begin
    if tg_op = 'INSERT' then
      if new.sesiones_restantes is null then return new; end if;
      v_viejo := 0;
    else
      if new.sesiones_restantes is not distinct from old.sesiones_restantes then return new; end if;
      v_viejo := coalesce(old.sesiones_restantes, 0);
    end if;
    v_nuevo := coalesce(new.sesiones_restantes, 0);
    v_delta := v_nuevo - v_viejo;
    if v_delta = 0 then return new; end if;

    begin
      v_ctx := nullif(current_setting('tentare.ledger', true), '')::jsonb;
    exception when others then
      v_ctx := null;
    end;

    v_tipo := coalesce(v_ctx ->> 'tipo', case when tg_op = 'INSERT' then 'COMPRA' else 'AJUSTE_SIN_CONTEXTO' end);

    insert into public.movimientos_derecho
      (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues,
       reserva_id, recibo_id, actor_tipo, actor_id, motivo, contexto)
    values
      (new.studio_id, new.socio_id, 'SUSCRIPCION', new.id, v_tipo, v_delta, v_nuevo,
       v_ctx ->> 'reserva_id', v_ctx ->> 'recibo_id',
       coalesce(v_ctx ->> 'actor_tipo', case when public.es_llamada_servicio() then 'sistema' else 'staff' end),
       coalesce(v_ctx ->> 'actor_id', auth.uid()::text),
       v_ctx ->> 'motivo',
       coalesce(v_ctx - 'tipo' - 'reserva_id' - 'recibo_id' - 'actor_tipo' - 'actor_id' - 'motivo', '{}'::jsonb));
  exception when others then
    raise warning 'ledger_suscripcion_saldo: % (suscripcion %)', sqlerrm, new.id;
  end;
  return new;
end;
$fn$;

revoke all on function public.ledger_suscripcion_saldo() from public, anon, authenticated;

create or replace function public.ledger_recuperacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viejo int;
  v_nuevo int;
  v_tipo text;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.movimientos_derecho
        (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id, motivo)
      values
        (new.studio_id, new.socio_id, 'RECUPERACION', new.id, 'CONCESION_RECUPERACION', 1, 1, new.origen_reserva_id,
         case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text, new.motivo);
      if new.estado is distinct from 'DISPONIBLE' then
        insert into public.movimientos_derecho
          (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id)
        values
          (new.studio_id, new.socio_id, 'RECUPERACION', new.id,
           case when new.estado = 'USADA' then 'USO_RECUPERACION' else 'CADUCIDAD_RECUPERACION' end,
           -1, 0, new.usada_en_reserva_id,
           case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text);
      end if;
      return new;
    end if;

    if new.estado is not distinct from old.estado then return new; end if;
    v_viejo := case when old.estado = 'DISPONIBLE' then 1 else 0 end;
    v_nuevo := case when new.estado = 'DISPONIBLE' then 1 else 0 end;
    if v_viejo = v_nuevo then return new; end if;

    v_tipo := case
      when v_nuevo < v_viejo and new.estado = 'USADA' then 'USO_RECUPERACION'
      when v_nuevo < v_viejo then 'CADUCIDAD_RECUPERACION'
      when old.estado = 'USADA' then 'RESTITUCION_RECUPERACION'
      else 'AJUSTE_SIN_CONTEXTO'
    end;

    insert into public.movimientos_derecho
      (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo, actor_id)
    values
      (new.studio_id, new.socio_id, 'RECUPERACION', new.id, v_tipo, v_nuevo - v_viejo, v_nuevo,
       case when v_tipo = 'RESTITUCION_RECUPERACION' then old.usada_en_reserva_id else new.usada_en_reserva_id end,
       case when public.es_llamada_servicio() then 'sistema' else 'staff' end, auth.uid()::text);
  exception when others then
    raise warning 'ledger_recuperacion: % (recuperacion %)', sqlerrm, new.id;
  end;
  return new;
end;
$fn$;

revoke all on function public.ledger_recuperacion() from public, anon, authenticated;

create trigger trg_ledger_suscripcion_saldo
  after insert or update of sesiones_restantes on public.suscripciones
  for each row execute function public.ledger_suscripcion_saldo();

create trigger trg_ledger_recuperacion
  after insert or update of estado on public.recuperaciones
  for each row execute function public.ledger_recuperacion();

-- 3. Saldo de apertura de lo que ya existe, por DIFERENCIA ───────────────────
-- (saldo actual menos lo ya anotado por los triggers): idempotente, y exacto aunque se
-- haya movido algo entre medias. El pasado anterior a esta fecha NO se reconstruye: no
-- hay forma de saber qué reserva consumió qué en las que se rastrearon antes del 22-sep.

insert into public.movimientos_derecho
  (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, actor_tipo, motivo)
select s.studio_id, s.socio_id, 'SUSCRIPCION', s.id, 'APERTURA',
       s.sesiones_restantes - coalesce(m.suma, 0), s.sesiones_restantes, 'sistema',
       'Saldo a la fecha de activación del ledger'
  from public.suscripciones s
  left join (select derecho_id, sum(delta) as suma
               from public.movimientos_derecho
              where derecho_tipo = 'SUSCRIPCION'
              group by derecho_id) m on m.derecho_id = s.id
 where s.sesiones_restantes is not null
   and s.sesiones_restantes - coalesce(m.suma, 0) <> 0;

insert into public.movimientos_derecho
  (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, actor_tipo, motivo)
select r.studio_id, r.socio_id, 'RECUPERACION', r.id, 'APERTURA',
       (case when r.estado = 'DISPONIBLE' then 1 else 0 end) - coalesce(m.suma, 0),
       case when r.estado = 'DISPONIBLE' then 1 else 0 end, 'sistema',
       'Saldo a la fecha de activación del ledger'
  from public.recuperaciones r
  left join (select derecho_id, sum(delta) as suma
               from public.movimientos_derecho
              where derecho_tipo = 'RECUPERACION'
              group by derecho_id) m on m.derecho_id = r.id
 where (case when r.estado = 'DISPONIBLE' then 1 else 0 end) - coalesce(m.suma, 0) <> 0;

-- 4. Conciliación: saldo frente a suma de movimientos. Debe estar siempre VACÍA. ──

create or replace view public.ledger_conciliacion
with (security_invoker = on) as
select s.studio_id, 'SUSCRIPCION'::text as derecho_tipo, s.id as derecho_id,
       s.sesiones_restantes as saldo, coalesce(m.suma, 0)::int as suma_movimientos,
       s.sesiones_restantes - coalesce(m.suma, 0)::int as diferencia
  from public.suscripciones s
  left join (select derecho_id, sum(delta) as suma
               from public.movimientos_derecho where derecho_tipo = 'SUSCRIPCION' group by derecho_id) m
    on m.derecho_id = s.id
 where s.sesiones_restantes is not null
   and s.sesiones_restantes - coalesce(m.suma, 0) <> 0
union all
select r.studio_id, 'RECUPERACION'::text, r.id,
       case when r.estado = 'DISPONIBLE' then 1 else 0 end, coalesce(m.suma, 0)::int,
       (case when r.estado = 'DISPONIBLE' then 1 else 0 end) - coalesce(m.suma, 0)::int
  from public.recuperaciones r
  left join (select derecho_id, sum(delta) as suma
               from public.movimientos_derecho where derecho_tipo = 'RECUPERACION' group by derecho_id) m
    on m.derecho_id = r.id
 where (case when r.estado = 'DISPONIBLE' then 1 else 0 end) - coalesce(m.suma, 0) <> 0;

revoke all on public.ledger_conciliacion from anon, authenticated;
grant select on public.ledger_conciliacion to service_role;

-- 5. Las funciones del motor dicen POR QUÉ mueven el saldo ───────────────────
-- Mismos cuerpos que los vigentes en producción (verificados con pg_get_functiondef),
-- con una sola adición cada una: el contexto del ledger alrededor de su UPDATE de saldo.

create or replace function public.consumir_bono_interno(p_reserva_id text, p_suscripcion_id text, p_studio_id text)
returns table(resultado text, saldo_restante integer, suscripcion_consumida_id text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_estado text;
  v_sesion_id text;
  v_socio_id text;
  v_decidido_en timestamptz;
  v_sus_previa text;
  v_sus_socio_id text;
  v_plan_id text;
  v_tipo_clase_id text;
  v_acotado boolean;
  v_saldo integer;
  v_cuota text;
begin
  select r.estado, r.sesion_id, r.socio_id, r.bono_decidido_en, r.bono_suscripcion_id
    into v_estado, v_sesion_id, v_socio_id, v_decidido_en, v_sus_previa
    from public.reservas as r
   where r.id = p_reserva_id and r.studio_id = p_studio_id
   for update;

  if not found then
    return query select 'RESERVA_NO_ENCONTRADA'::text, null::integer, null::text;
    return;
  end if;

  if v_decidido_en is not null then
    if v_sus_previa is null then
      return query select 'YA_DECIDIDA'::text, null::integer, null::text;
      return;
    end if;
    return query
      select 'YA_CONSUMIDA'::text,
             (select s.sesiones_restantes
                from public.suscripciones as s
               where s.id = v_sus_previa and s.studio_id = p_studio_id),
             v_sus_previa;
    return;
  end if;

  if v_estado not in ('CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO') then
    return query select 'NO_OCUPA_PLAZA'::text, null::integer, null::text;
    return;
  end if;

  if p_suscripcion_id is null then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;

    -- Ledger en sombra: ¿la cubre una cuota o no la cubre nada? No cambia el resultado
    -- y no puede fallar la reserva.
    begin
      select ss.tipo_clase_id into v_tipo_clase_id
        from public.sesiones as ss where ss.id = v_sesion_id and ss.studio_id = p_studio_id;
      select s.id into v_cuota
        from public.suscripciones as s
        join public.planes_tarifa as p on p.id = s.plan_id and p.studio_id = s.studio_id
       where s.studio_id = p_studio_id and s.socio_id = v_socio_id and s.estado = 'ACTIVA'
         and p.tipo = 'MENSUAL'
         and (s.fecha_fin is null or s.fecha_fin >= current_date)
         and public.plan_cubre_tipo_clase(p.id, v_tipo_clase_id)
       order by s.id collate "C"
       limit 1;
      insert into public.movimientos_derecho
        (studio_id, socio_id, derecho_tipo, derecho_id, tipo, delta, saldo_despues, reserva_id, actor_tipo)
      values
        (p_studio_id, v_socio_id, case when v_cuota is null then 'NINGUNO' else 'SUSCRIPCION' end, v_cuota,
         case when v_cuota is null then 'SIN_COBERTURA' else 'USO_CUOTA' end, 0, null, p_reserva_id, 'sistema');
    exception when others then
      raise warning 'consumir_bono_interno (ledger): %', sqlerrm;
    end;

    return query select 'SIN_BONO'::text, null::integer, null::text;
    return;
  end if;

  if v_sesion_id is null then
    raise exception 'SESION_REQUERIDA';
  end if;

  select s.plan_id, s.socio_id into v_plan_id, v_sus_socio_id
    from public.suscripciones as s
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id;

  if v_sus_socio_id is null or v_sus_socio_id is distinct from v_socio_id then
    raise exception 'SUSCRIPCION_NO_ES_DE_LA_SOCIA';
  end if;

  select ss.tipo_clase_id into v_tipo_clase_id
    from public.sesiones as ss
   where ss.id = v_sesion_id and ss.studio_id = p_studio_id;

  select exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
  ) into v_acotado;

  if v_acotado and v_tipo_clase_id is not null and not exists (
    select 1 from public.plan_tipos_clase as ptc
     where ptc.plan_id = v_plan_id and ptc.studio_id = p_studio_id
       and ptc.tipo_clase_id = v_tipo_clase_id
  ) then
    raise exception 'BONO_NO_CUBRE_CLASE';
  end if;

  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'CONSUMO_BONO', 'reserva_id', p_reserva_id, 'actor_tipo', 'sistema')::text, true);

  update public.suscripciones as s
     set sesiones_restantes = s.sesiones_restantes - 1
   where s.id = p_suscripcion_id
     and s.studio_id = p_studio_id
     and s.sesiones_restantes > 0
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  -- ⚠️ `v_saldo is null` y NO `not found`: un PERFORM (el de arriba) también fija FOUND, y
  -- «no se actualizó ninguna fila» dejaría de verse. Con el saldo ya decrementado nunca es
  -- nulo (la condición `sesiones_restantes > 0` deja al menos 0).
  if v_saldo is null then
    update public.reservas as r
       set bono_decidido_en = now(), bono_suscripcion_id = null
     where r.id = p_reserva_id;
    return query select 'SIN_SALDO'::text, null::integer, null::text;
    return;
  end if;

  update public.reservas as r
     set bono_suscripcion_id = p_suscripcion_id,
         bono_decidido_en = now()
   where r.id = p_reserva_id;

  return query select 'CONSUMIDA'::text, v_saldo, p_suscripcion_id;
end;
$function$;

create or replace function public.devolver_sesion_bono_por_reserva(p_studio_id text, p_reserva_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_suscripcion_id text;
  v_saldo int;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  update public.reservas r
     set bono_devuelto_en = now()
   where r.id = p_reserva_id
     and r.studio_id = p_studio_id
     and r.bono_devuelto_en is null
     and r.bono_consumo_rastreado is true
     and r.bono_suscripcion_id is not null
  returning r.bono_suscripcion_id into v_suscripcion_id;

  if v_suscripcion_id is null then
    return null;
  end if;

  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'DEVOLUCION_BONO', 'reserva_id', p_reserva_id, 'via', 'por_reserva')::text, true);

  update public.suscripciones s
     set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = v_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  if v_saldo is null then
    update public.reservas set bono_devuelto_en = null
     where id = p_reserva_id and studio_id = p_studio_id;
    return null;
  end if;

  return v_saldo;
end;
$function$;

revoke all on function public.devolver_sesion_bono_por_reserva(text, text) from public, anon;

create or replace function public.devolver_sesion_bono_legado_por_reserva(p_studio_id text, p_reserva_id text, p_suscripcion_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sellada boolean;
  v_saldo int;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- 1. RECLAMAR la reserva. Sin exigir `bono_consumo_rastreado`: esta RPC es
  --    justo para las que NO lo cumplen. Bloquea la fila hasta el commit —
  --    dos peticiones simultáneas con el mismo `p_reserva_id` no pasan las dos.
  update public.reservas r
     set bono_devuelto_en = now()
   where r.id = p_reserva_id
     and r.studio_id = p_studio_id
     and r.bono_devuelto_en is null
  returning true into v_sellada;

  if not coalesce(v_sellada, false) then
    return null;
  end if;

  -- 2. Devolver a la suscripción que TS ya eligió (`bonoDevolvible`), con el
  --    mismo tope en el WHERE que las dos RPCs hermanas.
  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'DEVOLUCION_BONO', 'reserva_id', p_reserva_id, 'via', 'legado')::text, true);

  update public.suscripciones s
     set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  if v_saldo is null then
    update public.reservas set bono_devuelto_en = null
     where id = p_reserva_id and studio_id = p_studio_id;
    return null;
  end if;

  return v_saldo;
end;
$function$;

revoke all on function public.devolver_sesion_bono_legado_por_reserva(text, text, text) from public, anon;

create or replace function public.devolver_sesion_bono(p_suscripcion_id text, p_studio_id text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_saldo int;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH';
  end if;
  if not public.es_llamada_servicio() and not public.puede_gestionar_calendario() then
    raise exception 'NO_AUTORIZADO';
  end if;

  -- `via = ciega`: este +1 no sabe qué reserva lo provoca. El ledger lo etiqueta para poder
  -- medir cuánto se sigue usando antes de retirarlo.
  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'DEVOLUCION_BONO', 'via', 'ciega')::text, true);

  update public.suscripciones s set sesiones_restantes = s.sesiones_restantes + 1
    from public.planes_tarifa p
   where s.id = p_suscripcion_id and s.studio_id = p_studio_id
     and p.id = s.plan_id and p.studio_id = p_studio_id
     and s.sesiones_restantes is not null
     and (p.sesiones is null or s.sesiones_restantes < p.sesiones)
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  return v_saldo;
end; $function$;

revoke all on function public.devolver_sesion_bono(text, text) from public, anon;

create or replace function public.renovar_bono_idempotente(p_recibo_id text, p_studio_id text, p_sesiones integer)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_aplicada boolean; v_suscripcion_id text; v_saldo int;
begin
  if not public.es_llamada_servicio() and p_studio_id is distinct from public.current_studio_id() then
    raise exception 'STUDIO_MISMATCH'; end if;
  if p_sesiones is null or p_sesiones <= 0 then return null; end if;
  select r.entrega_aplicada, r.suscripcion_id into v_aplicada, v_suscripcion_id
    from recibos as r where r.id = p_recibo_id and r.studio_id = p_studio_id for update;
  if not found then return null; end if;
  if v_aplicada is true then return null; end if;
  if v_suscripcion_id is null then return null; end if;

  perform set_config('tentare.ledger',
    jsonb_build_object('tipo', 'RENOVACION', 'recibo_id', p_recibo_id)::text, true);

  update suscripciones s set sesiones_restantes = coalesce(s.sesiones_restantes,0) + p_sesiones, estado='ACTIVA'
   where s.id = v_suscripcion_id and s.studio_id = p_studio_id
  returning s.sesiones_restantes into v_saldo;

  perform set_config('tentare.ledger', '', true);

  if v_saldo is null then return null; end if;
  update recibos set entrega_aplicada = true, entrega_aplicada_en = now()
   where id = p_recibo_id and studio_id = p_studio_id;
  return v_saldo;
end; $function$;

-- CREATE OR REPLACE conserva los permisos, pero lo dejamos escrito: anon nunca.
revoke all on function public.renovar_bono_idempotente(text, text, integer) from public, anon;

-- 6. Saldo nunca negativo ─────────────────────────────────────────────────────
-- Hoy no hay ninguno (comprobado en producción). NOT VALID + VALIDATE: la
-- restricción vale ya para toda escritura nueva y se comprueba la tabla entera.
alter table public.suscripciones
  add constraint suscripciones_sesiones_no_negativas
  check (sesiones_restantes is null or sesiones_restantes >= 0) not valid;
alter table public.suscripciones validate constraint suscripciones_sesiones_no_negativas;

-- 7. Verificación: el estado FINAL, no lo que se escribió ─────────────────────
do $$
declare
  v_rotos int;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'movimientos_derecho' and c.relrowsecurity) then
    raise exception 'movimientos_derecho no tiene RLS activada';
  end if;
  if has_table_privilege('authenticated', 'public.movimientos_derecho', 'INSERT')
     or has_table_privilege('authenticated', 'public.movimientos_derecho', 'UPDATE')
     or has_table_privilege('authenticated', 'public.movimientos_derecho', 'DELETE')
     or has_any_column_privilege('anon', 'public.movimientos_derecho', 'SELECT')
     or has_any_column_privilege('anon', 'public.movimientos_derecho', 'INSERT') then
    raise exception 'movimientos_derecho: privilegios de más para authenticated/anon';
  end if;
  if not has_table_privilege('authenticated', 'public.movimientos_derecho', 'SELECT') then
    raise exception 'movimientos_derecho: authenticated debe poder leer (la RLS filtra)';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'suscripciones' and t.tgname = 'trg_ledger_suscripcion_saldo' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'recuperaciones' and t.tgname = 'trg_ledger_recuperacion' and not t.tgisinternal) then
    raise exception 'faltan los triggers del ledger';
  end if;
  if has_function_privilege('anon', 'public.ledger_suscripcion_saldo()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ledger_suscripcion_saldo()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.ledger_recuperacion()'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ledger_recuperacion()'::regprocedure, 'EXECUTE') then
    raise exception 'las funciones de trigger del ledger son ejecutables por anon/authenticated';
  end if;
  -- Las cinco funciones del motor llevan el contexto del ledger.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('consumir_bono_interno', 'devolver_sesion_bono_por_reserva',
                           'devolver_sesion_bono_legado_por_reserva', 'devolver_sesion_bono', 'renovar_bono_idempotente')
         and position('tentare.ledger' in p.prosrc) > 0) <> 5 then
    raise exception 'alguna función del motor no pone el contexto del ledger';
  end if;
  -- Los permisos de las funciones del motor no se han movido (CREATE OR REPLACE los conserva).
  if has_function_privilege('anon', 'public.consumir_bono_interno(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consumir_bono_interno(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'consumir_bono_interno es ejecutable por anon/authenticated';
  end if;
  -- anon nunca ejecuta el motor, ni las funciones que ya podía llamar la gestión (authenticated).
  if has_function_privilege('anon', 'public.devolver_sesion_bono_por_reserva(text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.devolver_sesion_bono_legado_por_reserva(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.devolver_sesion_bono(text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.renovar_bono_idempotente(text,text,integer)'::regprocedure, 'EXECUTE') then
    raise exception 'alguna función del motor es ejecutable por anon';
  end if;
  -- Lo que la gestión ya podía llamar desde el panel se queda igual: no se cierra nada por sorpresa.
  if not has_function_privilege('authenticated', 'public.devolver_sesion_bono_por_reserva(text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.devolver_sesion_bono(text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'el panel ha perdido el permiso de devolver una sesión de bono';
  end if;
  -- El ledger suma exactamente el saldo.
  select count(*) into v_rotos from public.ledger_conciliacion;
  if v_rotos > 0 then
    raise exception 'el ledger no concilia con el saldo en % derechos', v_rotos;
  end if;
end $$;
