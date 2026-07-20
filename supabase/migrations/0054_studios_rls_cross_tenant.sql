-- ═══════════════════════════════════════════════════════════════════════════
-- P-2 (1/2) · Funciones de acceso acotado — PASO ADITIVO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
-- La política `public_read_studios` era `FOR SELECT USING (true)` sin rol
-- acotado. Como `authenticated` tiene GRANT SELECT sobre la tabla y el registro
-- es abierto, CUALQUIER usuario registrado podía leer TODAS las filas de
-- `studios`, incluyendo:
--   nif, razon_social, email, telefono, owner_auth_user_id,
--   stripe_account_id, stripe_customer_id, subscription_id,
--   subscription_status, current_period_end, google_calendar_email,
--   stripe_terminal_reader_id, stripe_terminal_location_id
--   y `kiosk_token` — el token que autoriza el check-in de kiosko, que a su vez
--   concede créditos canjeables (ver C-2 en 0007_kiosk_token.sql).
--
-- `anon` NO estaba afectado: no tiene GRANT SELECT (verificado), así que la
-- política no le servía de nada. La fuga era exclusivamente para usuarios
-- autenticados.
--
-- SOLUCIÓN
-- La lectura se acota al propio estudio con `current_studio_id()`, que resuelve
-- por instructora vinculada O por propietaria — así cubre los tres roles
-- (PROPIETARIO, INSTRUCTOR, RECEPCION) y no solo al dueño, que es lo que hacía
-- la política `owner_studios` por su cuenta.
--
-- Los dos accesos legítimamente cross-tenant se sustituyen por funciones
-- SECURITY DEFINER que devuelven EXACTAMENTE el dato necesario (un booleano y
-- un id), en vez de dar lectura a toda la fila:
--   · alta de estudio  -> slug_estudio_disponible()
--   · /portal|/reservar -> studio_id_por_slug()
--
-- Reversible: recrear `public_read_studios USING (true)` y borrar las dos
-- funciones. Reejecutable: todo con IF EXISTS / OR REPLACE.

-- ESTE PASO NO CAMBIA NINGUNA POLÍTICA. Solo crea las dos funciones que el
-- código nuevo necesita. Se aplica ANTES de desplegar el código: así el
-- código viejo sigue funcionando igual y el nuevo ya encuentra las RPC.
-- El cierre de la fuga va en 0055, DESPUÉS del despliegue.

BEGIN;

-- ── 2) Slug: unicidad en el alta, sin exponer filas ──────────────────────────
-- Durante el alta el usuario todavía no tiene estudio, así que
-- current_studio_id() es NULL y no podría comprobar la unicidad. Devuelve solo
-- un booleano: no filtra ni ids ni nombres de otros estudios.
CREATE OR REPLACE FUNCTION public.slug_estudio_disponible(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.studios WHERE slug = p_slug);
$$;
REVOKE ALL ON FUNCTION public.slug_estudio_disponible(text) FROM public;
GRANT EXECUTE ON FUNCTION public.slug_estudio_disponible(text) TO authenticated;

-- ── 3) Slug -> id para las rutas públicas ────────────────────────────────────
-- /portal/[slug] y /reservar/[slug] necesitan resolver el estudio antes de
-- tener sesión de staff (visitante anónimo o socia por OTP, que no es ni
-- instructora ni propietaria). Devuelve solo el id; el resto de datos públicos
-- ya se sirven por /api/public/studio-data con service-role.
CREATE OR REPLACE FUNCTION public.studio_id_por_slug(p_slug text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.studios WHERE slug = p_slug LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.studio_id_por_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.studio_id_por_slug(text) TO anon, authenticated;


COMMIT;
