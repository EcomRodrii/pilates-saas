-- Consentimiento de datos de salud (art. 9 RGPD) demostrable y revocable.
--
-- Auditoría RGPD 2026-09-13, H3. Desde el panel se guardaba la fecha del
-- NAVEGADOR y un nombre tecleado, sin el texto aceptado ni quién del estudio lo
-- registró; y como `authenticated` tenía UPDATE de TABLA sobre `socios`,
-- RECEPCIÓN y MANAGER (que no son roles clínicos) podían marcarlo, o poner
-- `consentimiento_salud_revocado_en = NULL` y resucitar una revocación. La
-- alumna no tenía forma de retirarlo.
--
-- Piezas:
--  1. `socios.consentimiento_salud_registrado_por_uid` — el usuario de Auth que
--     lo registró (staff o la propia alumna).
--  2. `consentimientos_salud_eventos` — historial APPEND-ONLY (OTORGADO /
--     REVOCADO). Por qué tabla y no más columnas: las columnas de `socios` solo
--     guardan el ESTADO ACTUAL, y volver a consentir tras revocar las
--     sobrescribe. El art. 7.1 pide poder demostrar el consentimiento de CADA
--     periodo en que se trató el dato; con columnas, el primer ciclo
--     (otorgado → revocado) desaparecía en el segundo. Las columnas de `socios`
--     se quedan como estado vigente porque de ellas cuelga
--     `tiene_consentimiento_salud()` y trece políticas.
--  3. `consentimiento_salud_cambiar(...)` — única vía de escritura: bloquea la
--     fila, cambia el estado y apunta el evento en la MISMA transacción. Solo
--     service_role (la llaman las rutas de servidor, que fijan `now()`, el
--     actor y el texto vigente derivado en servidor).
--  4. `authenticated` pierde INSERT y UPDATE sobre las columnas
--     `consentimiento_salud_*`. El grant era de TABLA entera (acl
--     `authenticated=arwdm`), y un `REVOKE UPDATE (col)` es un no-op cuando el
--     privilegio es de tabla (mismo caso que 20260910170000 en `studios`):
--     se revoca el de tabla y se concede columna a columna el resto.
--
-- ⚠️ Consecuencia para el futuro: una columna NUEVA en `socios` ya no será
-- escribible por `authenticated` sin su `grant insert/update (col)`. Lo vigila
-- `lib/rgpd-salud-acceso-contrato.test.ts`.
--
-- Qué pasa con los datos al revocar: se BLOQUEAN (dejan de ser visibles para
-- el personal por la RLS, que ya exige consentimiento vigente), no se borran.
-- ⚠️ Borrar o conservar bloqueado es decisión legal pendiente.

-- ─── 1. Columna ─────────────────────────────────────────────────────────────

alter table public.socios
  add column if not exists consentimiento_salud_registrado_por_uid uuid;

comment on column public.socios.consentimiento_salud_registrado_por_uid is
  'auth.users.id de quien registró el consentimiento de salud vigente (staff o la propia socia). Lo escribe solo consentimiento_salud_cambiar().';

-- ─── 2. Historial ───────────────────────────────────────────────────────────

create table if not exists public.consentimientos_salud_eventos (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  tipo text not null check (tipo in ('OTORGADO', 'REVOCADO')),
  en timestamptz not null default now(),
  -- PANEL = staff clínico en mostrador; PORTAL = la propia alumna;
  -- HISTORICO = reconstruido de las columnas al crear esta tabla.
  origen text not null check (origen in ('PANEL', 'PORTAL', 'HISTORICO')),
  -- Texto COMPLETO aceptado (solo en OTORGADO).
  texto text,
  -- Nombre tecleado por la socia en mostrador, o 'SOCIA' si fue desde su app.
  firma text,
  actor_uid uuid,
  actor_rol text,
  constraint consentimientos_salud_eventos_texto_si_otorgado
    check (tipo <> 'OTORGADO' or origen = 'HISTORICO' or (texto is not null and firma is not null))
);

create index if not exists idx_consentimientos_salud_eventos_socio
  on public.consentimientos_salud_eventos (studio_id, socio_id, en desc);

alter table public.consentimientos_salud_eventos enable row level security;

-- Append-only para el cliente: nadie del navegador inserta, cambia ni borra.
-- La lectura, solo la propietaria (es la prueba legal del estudio).
revoke all on table public.consentimientos_salud_eventos from anon;
revoke all on table public.consentimientos_salud_eventos from authenticated;
grant select on table public.consentimientos_salud_eventos to authenticated;
grant all on table public.consentimientos_salud_eventos to service_role;

drop policy if exists consentimientos_salud_eventos_lectura on public.consentimientos_salud_eventos;
create policy consentimientos_salud_eventos_lectura on public.consentimientos_salud_eventos
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

-- Lo que ya consta: un OTORGADO por cada consentimiento con fecha, y un
-- REVOCADO si además está revocado. Idempotente.
insert into public.consentimientos_salud_eventos (studio_id, socio_id, tipo, en, origen, texto, firma)
select s.studio_id, s.id, 'OTORGADO', s.consentimiento_salud_fecha, 'HISTORICO',
       s.consentimiento_salud_texto, s.consentimiento_salud_registrado_por
from public.socios s
where s.consentimiento_salud_fecha is not null
  and not exists (
    select 1 from public.consentimientos_salud_eventos e
    where e.socio_id = s.id and e.tipo = 'OTORGADO' and e.origen = 'HISTORICO'
  );

insert into public.consentimientos_salud_eventos (studio_id, socio_id, tipo, en, origen)
select s.studio_id, s.id, 'REVOCADO', s.consentimiento_salud_revocado_en, 'HISTORICO'
from public.socios s
where s.consentimiento_salud_fecha is not null
  and s.consentimiento_salud_revocado_en is not null
  and not exists (
    select 1 from public.consentimientos_salud_eventos e
    where e.socio_id = s.id and e.tipo = 'REVOCADO' and e.origen = 'HISTORICO'
  );

-- ─── 3. Única vía de escritura ──────────────────────────────────────────────
--
-- Devuelve 'OK' | 'YA_CONSTABA' | 'NO_CONSTABA' | 'SOCIA_NO_ENCONTRADA'.
-- No comprueba rol: la llama solo service_role, y la ruta decide quién puede
-- (rol clínico + alumna asignada, o la propia socia con su JWT).

create or replace function public.consentimiento_salud_cambiar(
  p_studio_id text,
  p_socio_id text,
  p_tipo text,
  p_origen text,
  p_texto text,
  p_firma text,
  p_actor_uid uuid,
  p_actor_rol text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_fecha timestamptz;
  v_revocado timestamptz;
begin
  if p_tipo is null or p_tipo not in ('OTORGADO', 'REVOCADO') then
    raise exception 'TIPO_NO_VALIDO';
  end if;
  if p_origen is null or p_origen not in ('PANEL', 'PORTAL') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;

  select s.consentimiento_salud_fecha, s.consentimiento_salud_revocado_en
    into v_fecha, v_revocado
  from public.socios s
  where s.id = p_socio_id
    and s.studio_id = p_studio_id
    and s.borrado_en is null
  for update;

  if not found then
    return 'SOCIA_NO_ENCONTRADA';
  end if;

  if p_tipo = 'OTORGADO' then
    -- Ya vigente: no se sobrescribe la prueba que hay.
    if v_fecha is not null and v_revocado is null then
      return 'YA_CONSTABA';
    end if;
    if coalesce(btrim(p_texto), '') = '' or coalesce(btrim(p_firma), '') = '' then
      raise exception 'FALTA_TEXTO_O_FIRMA';
    end if;
    update public.socios
       set consentimiento_salud_fecha = now(),
           consentimiento_salud_registrado_por = p_firma,
           consentimiento_salud_registrado_por_uid = p_actor_uid,
           consentimiento_salud_texto = p_texto,
           consentimiento_salud_revocado_en = null
     where id = p_socio_id;
  else
    if v_fecha is null or v_revocado is not null then
      return 'NO_CONSTABA';
    end if;
    -- Se sella la revocación SIN borrar fecha, firma ni texto: son la prueba
    -- de lo que hubo mientras estuvo vigente.
    update public.socios
       set consentimiento_salud_revocado_en = now()
     where id = p_socio_id;
  end if;

  insert into public.consentimientos_salud_eventos
    (studio_id, socio_id, tipo, origen, texto, firma, actor_uid, actor_rol)
  values
    (p_studio_id, p_socio_id, p_tipo, p_origen,
     case when p_tipo = 'OTORGADO' then p_texto end,
     p_firma, p_actor_uid, p_actor_rol);

  return 'OK';
end;
$function$;

revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from public;
revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from anon;
revoke all on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) from authenticated;
grant execute on function public.consentimiento_salud_cambiar(text, text, text, text, text, text, uuid, text) to service_role;

-- ─── 4. authenticated pierde la escritura de las columnas de consentimiento ─
--
-- Lista = las 44 columnas de `socios` en prod (information_schema, 2026-09-13)
-- MENOS las cinco `consentimiento_salud_*`. Nada más cambia: el resto de
-- columnas sigue exactamente como estaba (incluidas las que otras auditorías
-- señalan, que no son de este cambio). La RLS de fila
-- (`socios_escritura_*`, puede_gestionar_clientas) sigue igual.

revoke insert on table public.socios from authenticated;
revoke update on table public.socios from authenticated;

grant insert (
  id, studio_id, nombre, apellidos, email, telefono, nif, fecha_alta, activo,
  lead_stage, tags, aceptacion_fecha, aceptacion_firma, aceptacion_version,
  stripe_customer_id, stripe_payment_method_id, avatar, referido_por,
  fecha_nacimiento, foto_url, auth_user_id, direccion, borrado_en, campos_extra,
  metodo_pago_preferido, sepa_mandate_id, sepa_payment_method_id,
  aceptacion_origen, aceptacion_por, tarjeta_exp_mes, tarjeta_exp_anio,
  tarjeta_marca, tarjeta_ultimos4, origen_lead, consentimiento_marketing_en,
  consentimiento_marketing_texto, consentimiento_marketing_por, visible_en_clase,
  usuario, objetivo_clases_mes
) on table public.socios to authenticated;

grant update (
  id, studio_id, nombre, apellidos, email, telefono, nif, fecha_alta, activo,
  lead_stage, tags, aceptacion_fecha, aceptacion_firma, aceptacion_version,
  stripe_customer_id, stripe_payment_method_id, avatar, referido_por,
  fecha_nacimiento, foto_url, auth_user_id, direccion, borrado_en, campos_extra,
  metodo_pago_preferido, sepa_mandate_id, sepa_payment_method_id,
  aceptacion_origen, aceptacion_por, tarjeta_exp_mes, tarjeta_exp_anio,
  tarjeta_marca, tarjeta_ultimos4, origen_lead, consentimiento_marketing_en,
  consentimiento_marketing_texto, consentimiento_marketing_por, visible_en_clase,
  usuario, objetivo_clases_mes
) on table public.socios to authenticated;
