-- Aceptación del contrato de la socia: prueba fijada por el servidor y con
-- historial. Plan RGPD 3.17 / auditoría C-8 (anexo 12).
--
-- Antes: `socios.aceptacion_*` con la fecha del NAVEGADOR, el texto que mandaba
-- el navegador, sin IP ni user-agent, y 9 de 15 sin origen. Y como las columnas
-- solo guardan el estado vigente, volver a aceptar (p. ej. al añadirse la
-- cláusula de penalización) sobrescribía la prueba de la aceptación anterior.
--
-- Piezas (mismo patrón que `consentimientos_salud_eventos`, 20260913214142):
--  1. `aceptaciones_contrato_eventos` — APPEND-ONLY. Una fila por aceptación:
--     cuándo (now() del servidor), por qué puerta (PORTAL/MOSTRADOR), la huella
--     del texto (resoluble contra `terminos_versiones`, la misma tabla que ya
--     usa el sello por compra: el texto no se repite por fila), si el texto
--     que traía el navegador coincidía con el que compuso el servidor, la
--     firma, quién del estudio la introdujo, HMAC de la IP (nunca la IP) y el
--     user-agent recortado.
--     Por qué tabla y no columnas nuevas en `socios`: la historia no cabe en
--     columnas de estado, y así `socios` no gana columnas que habría que
--     excluir de la carga del panel ni conceder por columna.
--  2. `aceptacion_contrato_registrar(...)` — única vía que escribe la prueba:
--     bloquea la fila, fija las columnas de `socios` con valores del servidor
--     (de ellas cuelgan la ficha y el guard de penalizaciones) y apunta el
--     evento en la MISMA transacción. Solo service_role.
--
-- Las columnas `socios.aceptacion_*` siguen siendo escribibles por
-- `authenticated` (el alta de mostrador las pone al crear la ficha); la ruta
-- `/api/socios/[id]/aceptacion-contrato` las vuelve a sellar en servidor justo
-- después. Cerrar ese grant exige pasar el alta del panel a servidor: fuera de
-- este cambio.
--
-- ⚠️ REVISIÓN LEGAL NECESARIA: plazo de conservación de estos eventos (hoy se
-- borran solo con la ficha, ON DELETE CASCADE) y si la huella de IP es
-- necesaria o basta con fecha, texto y firma.

-- ─── 1. Historial ───────────────────────────────────────────────────────────

create table if not exists public.aceptaciones_contrato_eventos (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references public.studios(id) on delete cascade,
  socio_id text not null references public.socios(id) on delete cascade,
  en timestamptz not null default now(),
  origen text not null check (origen in ('PORTAL', 'MOSTRADOR')),
  texto_hash text not null check (texto_hash ~ '^[0-9a-f]{64}$'),
  -- NULL = el cliente no mandó texto; false = la pantalla enseñaba otro.
  texto_cliente_coincide boolean,
  firma text not null check (btrim(firma) <> ''),
  introducida_por text,
  actor_uid uuid,
  actor_rol text,
  ip_hmac text check (ip_hmac is null or ip_hmac ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 256),
  constraint aceptaciones_contrato_eventos_texto_fk
    foreign key (studio_id, texto_hash) references public.terminos_versiones (studio_id, hash)
);

create index if not exists idx_aceptaciones_contrato_eventos_socio
  on public.aceptaciones_contrato_eventos (studio_id, socio_id, en desc);

alter table public.aceptaciones_contrato_eventos enable row level security;

revoke all on table public.aceptaciones_contrato_eventos from anon;
revoke all on table public.aceptaciones_contrato_eventos from authenticated;
grant select on table public.aceptaciones_contrato_eventos to authenticated;
grant all on table public.aceptaciones_contrato_eventos to service_role;

drop policy if exists aceptaciones_contrato_eventos_lectura on public.aceptaciones_contrato_eventos;
create policy aceptaciones_contrato_eventos_lectura on public.aceptaciones_contrato_eventos
  for select to authenticated
  using (studio_id = current_studio_id() and current_rol() = 'PROPIETARIO');

-- ─── 2. Única vía de escritura ──────────────────────────────────────────────
--
-- Devuelve 'OK' | 'YA_CONSTABA' | 'SOCIA_NO_ENCONTRADA'. No comprueba rol: la
-- llama solo service_role; la ruta decide quién puede (la propia socia con su
-- JWT, o staff con `puedeGestionarClientas`).

create or replace function public.aceptacion_contrato_registrar(
  p_studio_id text,
  p_socio_id text,
  p_origen text,
  p_texto text,
  p_texto_hash text,
  p_texto_cliente_coincide boolean,
  p_firma text,
  p_introducida_por text,
  p_actor_uid uuid,
  p_actor_rol text,
  p_ip_hmac text,
  p_user_agent text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_fecha timestamptz;
  v_version text;
  v_firma text;
  v_origen text;
  v_firma_limpia text := btrim(coalesce(p_firma, ''));
begin
  if p_origen is null or p_origen not in ('PORTAL', 'MOSTRADOR') then
    raise exception 'ORIGEN_NO_VALIDO';
  end if;
  if coalesce(btrim(p_texto), '') = '' or v_firma_limpia = '' then
    raise exception 'FALTA_TEXTO_O_FIRMA';
  end if;
  if p_texto_hash is null or p_texto_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'HASH_NO_VALIDO';
  end if;

  select s.aceptacion_fecha, s.aceptacion_version, s.aceptacion_firma, s.aceptacion_origen
    into v_fecha, v_version, v_firma, v_origen
  from public.socios s
  where s.id = p_socio_id
    and s.studio_id = p_studio_id
    and s.borrado_en is null
  for update;

  if not found then
    return 'SOCIA_NO_ENCONTRADA';
  end if;

  -- La misma aceptación ya sellada (reintento, doble toque): no se reescribe
  -- la fecha de la prueba que hay.
  if v_fecha is not null
     and v_version = p_texto
     and v_firma = v_firma_limpia
     and v_origen = p_origen
     and exists (
       select 1 from public.aceptaciones_contrato_eventos e
       where e.studio_id = p_studio_id and e.socio_id = p_socio_id and e.texto_hash = p_texto_hash
     ) then
    return 'YA_CONSTABA';
  end if;

  -- El texto, una vez por versión y estudio (mismo id que el sello por compra).
  insert into public.terminos_versiones (id, studio_id, hash, texto)
  values ('tv-' || p_studio_id || '-' || left(p_texto_hash, 16), p_studio_id, p_texto_hash, p_texto)
  on conflict do nothing;

  update public.socios
     set aceptacion_fecha = now(),
         aceptacion_firma = v_firma_limpia,
         aceptacion_version = p_texto,
         aceptacion_origen = p_origen,
         aceptacion_por = case when p_origen = 'MOSTRADOR'
                               then nullif(btrim(coalesce(p_introducida_por, '')), '') end
   where id = p_socio_id
     and studio_id = p_studio_id;

  insert into public.aceptaciones_contrato_eventos
    (studio_id, socio_id, origen, texto_hash, texto_cliente_coincide, firma,
     introducida_por, actor_uid, actor_rol, ip_hmac, user_agent)
  values
    (p_studio_id, p_socio_id, p_origen, p_texto_hash, p_texto_cliente_coincide, v_firma_limpia,
     case when p_origen = 'MOSTRADOR' then nullif(btrim(coalesce(p_introducida_por, '')), '') end,
     p_actor_uid, p_actor_rol, p_ip_hmac, left(p_user_agent, 256));

  return 'OK';
end;
$function$;

revoke all on function public.aceptacion_contrato_registrar(text, text, text, text, text, boolean, text, text, uuid, text, text, text) from public;
revoke all on function public.aceptacion_contrato_registrar(text, text, text, text, text, boolean, text, text, uuid, text, text, text) from anon;
revoke all on function public.aceptacion_contrato_registrar(text, text, text, text, text, boolean, text, text, uuid, text, text, text) from authenticated;
grant execute on function public.aceptacion_contrato_registrar(text, text, text, text, text, boolean, text, text, uuid, text, text, text) to service_role;
