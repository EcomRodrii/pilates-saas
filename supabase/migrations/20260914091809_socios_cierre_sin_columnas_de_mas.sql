-- ─────────────────────────────────────────────────────────────────────────────
-- Corrige la migración anterior (`20260914091149`): al reescribir a mano la
-- lista completa de columnas del GRANT de `socios` a `authenticated`, se
-- colaron de vuelta seis columnas que `20260914080445_socios_datos_privados_cierre.sql`
-- excluía a propósito — entre ellas `consentimiento_salud_texto` y
-- `consentimiento_marketing_texto` (el texto legal completo de un
-- consentimiento de salud/marketing, no solo su fecha).
--
-- Ningún camino de cliente (rol `authenticated`) necesita ninguna de las seis:
-- `auth_user_id`, `aceptacion_version`, `excluir_de_perfilado` y
-- `consentimiento_salud_registrado_por_uid` no tienen un solo `.from('socios')`
-- en `studio-context.tsx` ni en `components/` que las lea; los usos reales de
-- los dos campos de texto (`lib/inngest/campanas.ts`, `automatizaciones.ts`,
-- las integraciones Mailchimp/Klaviyo, `/api/marketing/*`) pasan todos por
-- `getSupabaseAdmin()`/`requireSupabaseAdmin()` (service_role, ajeno a los
-- grants de columna). Confirmado con grep en todo `lib/`, `components/` y
-- `app/` antes de tocar el grant. Vuelve a dejar la lista exactamente como la
-- fijó `080445`.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select (
  auth_user_id, aceptacion_version, excluir_de_perfilado,
  consentimiento_salud_registrado_por_uid,
  consentimiento_salud_texto, consentimiento_marketing_texto
) on public.socios from authenticated;

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.socios', 'consentimiento_salud_texto', 'SELECT') THEN
    RAISE EXCEPTION 'consentimiento_salud_texto sigue visible para authenticated';
  END IF;
  IF has_column_privilege('authenticated', 'public.socios', 'consentimiento_marketing_texto', 'SELECT') THEN
    RAISE EXCEPTION 'consentimiento_marketing_texto sigue visible para authenticated';
  END IF;
  IF has_column_privilege('authenticated', 'public.socios', 'auth_user_id', 'SELECT') THEN
    RAISE EXCEPTION 'auth_user_id sigue visible para authenticated';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.socios', 'nombre', 'SELECT') THEN
    RAISE EXCEPTION 'el revoke se pasó de ancho: nombre ya no es visible';
  END IF;
END $$;
