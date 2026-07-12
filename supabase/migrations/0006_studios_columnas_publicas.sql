-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 · C-9: dejar de exponer la fila COMPLETA de `studios` al rol anon
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (due diligence, hallazgo C-9)
-- `public_read_studios ON studios FOR SELECT USING (true)` (0000_base.sql:3216)
-- no tiene cláusula de rol, así que aplica también a `anon`; combinado con
-- `GRANT ALL ON TABLE studios TO anon` (0000_base.sql:3801), CUALQUIERA con la
-- anon key pública puede pegar a /rest/v1/studios?select=* y volcar, de TODOS
-- los estudios: nif, razon_social, direccion, email, telefono,
-- owner_auth_user_id, stripe_account_id, stripe_customer_id, subscription_*,
-- current_period_end, google_calendar_email. Fuga cross-tenant de PII fiscal +
-- datos de facturación + IDs de Stripe (y primitiva de enumeración de estudios).
--
-- Por qué este fix y no una vista:
--   · El leak es de COLUMNAS, no de filas: en una plataforma de reservas los
--     estudios son negocios públicos, así que ver TODAS las filas está bien;
--     lo que sobra son las columnas sensibles.
--   · RLS es a nivel de fila; los privilegios de columna son a nivel de columna.
--     Se componen: anon ve todas las filas (por la política) pero solo las
--     columnas concedidas.
--   · Todos los lectores de columnas sensibles usan service-role
--     (studio-seo.ts, fetchPublicStudioData, cargarPoliticaEstudio, rutas
--     /api/*). Los lectores anónimos solo piden id/nombre. El panel lee la
--     fila completa de SU estudio como rol `authenticated` (grant explícito
--     intacto). Por eso este cambio NO requiere tocar código.
--
-- Columnas públicas seguras = branding + política de reserva (no PII, no dinero).
-- ═══════════════════════════════════════════════════════════════════════════

-- Quitar el SELECT de columna-completa del rol anon (y de PUBLIC por robustez;
-- authenticated/service_role conservan su GRANT explícito de 0000_base.sql).
REVOKE SELECT ON public.studios FROM anon;
REVOKE SELECT ON public.studios FROM PUBLIC;

-- Reconceder SELECT a anon SOLO sobre columnas públicas.
GRANT SELECT (
  id, nombre, slug, ciudad, color_primario, tema_portal, avatar_admin,
  cancelacion_ventana_horas, cancelacion_devolver_bono_tardia,
  reserva_exigir_plan, reserva_max_simultaneas
) ON public.studios TO anon;

-- A partir de aquí, un `select=*` anónimo devuelve "permission denied"; solo
-- resuelven los selects que piden columnas públicas. Nada de NIF/Stripe/billing.
