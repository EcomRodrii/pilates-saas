-- 20260909150000 · TENTARE — confirmar_sustitucion() ya no es callable por authenticated
--
-- 40ª pasada de auditoría (2026-09-09), hallazgo I-1: confirmar_sustitucion()
-- (0040/0042/0048_sustituciones_*.sql) es SECURITY INVOKER, no DEFINER —
-- corre con los permisos de quien llama, no con los del servidor. Con
-- GRANT EXECUTE a `authenticated` (pensado solo como red de seguridad, los
-- dos callers reales son server-only vía getSupabaseAdmin(): app/api/
-- sustituciones/route.ts y app/api/public/aceptar-sustitucion/route.ts) y la
-- política `admin_sustituciones` (0037) sin distinguir rol
-- (studio_id = current_studio_id()), cualquier socia/instructora autenticada
-- del mismo estudio puede invocarla directo por PostgREST y forzar el estado
-- de una sustitución sin pasar por las comprobaciones de rol/candidata que
-- solo viven en las rutas HTTP.
--
-- Mismo patrón que promocionar_siguiente_espera/aceptar_oferta_lista_espera:
-- revocar el EXECUTE a authenticated, dejar solo service_role (que es quien
-- de verdad la llama). No cambia la firma, no hace falta CREATE OR REPLACE.
--
-- ⚠️ Ninguna de las migraciones 0040/0042/0048 revocó PUBLIC — solo añadieron
-- GRANT a authenticated/service_role encima del EXECUTE TO PUBLIC que
-- Postgres concede por defecto al crear la función. Revocar solo de
-- `authenticated` no habría hecho nada: el privilegio se sigue heredando de
-- PUBLIC (verificado con has_function_privilege antes de escribir esto).
-- Los tres pasos explícitos, sin fiarse de la herencia.

REVOKE EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_sustitucion(text, text, text, uuid)
  TO service_role;
