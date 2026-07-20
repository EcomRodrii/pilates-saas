-- ═══════════════════════════════════════════════════════════════════════════
-- P-2 (2/2) · Cierre de la fuga cross-tenant
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

-- Se aplica DESPUÉS de desplegar el código que usa las funciones de 0054.
-- Aplicarlo antes dejaría al código viejo sin poder resolver el slug.

BEGIN;

-- ── 1) Lectura acotada al propio estudio ─────────────────────────────────────
DROP POLICY IF EXISTS public_read_studios ON public.studios;

DROP POLICY IF EXISTS own_studio_read ON public.studios;
CREATE POLICY own_studio_read ON public.studios
  FOR SELECT TO authenticated
  USING (id = public.current_studio_id());

-- ── 4) Endurecer los GRANT de anon ───────────────────────────────────────────
-- anon tenía INSERT/UPDATE/DELETE/TRUNCATE sobre studios. Los tres primeros los
-- frena RLS (no hay política que los permita para anon), pero TRUNCATE NO pasa
-- por RLS: es un privilegio de tabla. Ninguna ruta de la app escribe en studios
-- como anon, así que se retiran los cuatro.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.studios FROM anon;

COMMIT;
