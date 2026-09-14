-- Datos privados de la socia: solo PROPIETARIO y RECEPCION (auditoría RGPD
-- 2026-09-13, M1). Paso 1 de 3 — ADITIVO, no quita nada a nadie.
--
-- `socios_lectura` es `studio_id = current_studio_id()` para TODO el personal,
-- y `authenticated` tiene SELECT de TABLA: una instructora o un manager
-- recibían en el arranque del panel el NIF, la dirección, la fecha de
-- nacimiento, la firma del contrato y los identificadores de pago (Stripe,
-- SEPA, últimos 4 de la tarjeta) de todas las socias del estudio. Ninguna de
-- esas dos funciones los necesita: la recepción cobra y factura, la
-- propietaria es la responsable; el manager y la instructora trabajan con
-- nombre, contacto y lo operativo.
--
-- Despliegue en tres pasos, porque revocar el SELECT de tabla con el panel
-- viejo abierto rompería el arranque de todas las pestañas:
--   1. (esta) función de rol + RPC de lectura + columna del cumpleaños sin año.
--   2. código que lee lo público de la tabla y lo privado por la RPC.
--   3. `..._socios_datos_privados_cierre.sql`: revoca el SELECT de tabla, lo
--      concede por columnas y bloquea la escritura de lo privado. Se aplica
--      DESPUÉS de que (2) esté desplegado.
--
-- Nada de servidor cambia: service_role conserva todos sus grants.

-- ─── 1. Cumpleaños sin año, visible para todo el personal ───────────────────
--
-- Felicitar y segmentar («cumpleañeras del mes») no necesita el año. Columna
-- GENERADA para que no haya dos fuentes que puedan divergir. `to_char` NO vale:
-- con `date` resuelve a `to_char(timestamptz, text)`, que es STABLE (depende de
-- la zona horaria de la sesión), y una columna generada exige IMMUTABLE.
-- `extract(text, date)` y `lpad` sí lo son (comprobado en prod, 2026-09-14).
-- Sin grant de INSERT/UPDATE a nadie: una columna generada no se escribe.

alter table public.socios
  add column if not exists cumple_mm_dd text
  generated always as (
    lpad(extract(month from fecha_nacimiento)::integer::text, 2, '0')
    || '-' ||
    lpad(extract(day from fecha_nacimiento)::integer::text, 2, '0')
  ) stored;

comment on column public.socios.cumple_mm_dd is
  'Día y mes de nacimiento (MM-DD), sin año. Generada desde fecha_nacimiento; la fecha completa solo la ven PROPIETARIO y RECEPCION.';

-- ─── 2. Quién puede ver lo privado ──────────────────────────────────────────
--
-- Espejo SQL de `puedeVerDatosPrivadosSocia()` (lib/permisos-reglas.ts).
-- `current_rol()` es NULL sin sesión de staff (service_role, anon, una socia
-- del portal): el coalesce lo deja en `false`, falla cerrada.

create or replace function public.puede_ver_datos_privados_socia()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.current_rol() in ('PROPIETARIO', 'RECEPCION'), false);
$function$;

-- pg_default_acl da EXECUTE directo a anon/authenticated: revocar PUBLIC no basta.
revoke all on function public.puede_ver_datos_privados_socia() from public;
revoke all on function public.puede_ver_datos_privados_socia() from anon;
grant execute on function public.puede_ver_datos_privados_socia() to authenticated, service_role;

-- ─── 3. Lectura de lo privado para el panel ─────────────────────────────────
--
-- Mismo alcance de fila que `socios_lectura` (estudio activo, sin borradas) y
-- CERO filas si el rol no puede. Paginable con `.order('id').range()` desde
-- PostgREST (su tope de 1000 filas también corta a las RPC).
-- `language sql` y columnas calificadas con `s.`: evita el 42702 de las
-- `RETURNS TABLE` que coinciden en nombre con la tabla.

create or replace function public.socios_datos_privados()
returns table (
  id text,
  nif text,
  direccion text,
  fecha_nacimiento date,
  tarjeta_marca text,
  tarjeta_ultimos4 text,
  tarjeta_exp_mes smallint,
  tarjeta_exp_anio smallint,
  stripe_customer_id text,
  stripe_payment_method_id text,
  sepa_mandate_id text,
  sepa_payment_method_id text,
  aceptacion_firma text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id, s.nif, s.direccion, s.fecha_nacimiento,
         s.tarjeta_marca, s.tarjeta_ultimos4, s.tarjeta_exp_mes, s.tarjeta_exp_anio,
         s.stripe_customer_id, s.stripe_payment_method_id,
         s.sepa_mandate_id, s.sepa_payment_method_id,
         s.aceptacion_firma
  from public.socios as s
  where s.studio_id = public.current_studio_id()
    and s.borrado_en is null
    and public.puede_ver_datos_privados_socia()
  order by s.id;
$function$;

revoke all on function public.socios_datos_privados() from public;
revoke all on function public.socios_datos_privados() from anon;
grant execute on function public.socios_datos_privados() to authenticated, service_role;
