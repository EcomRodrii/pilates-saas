-- B1 (F1 seguridad) — Cierra los 2 últimos avisos anon_security_definer_function_
-- executable de funciones de tenancy: current_rol() y current_studio_id().
--
-- Anon no las necesita:
--  · RLS: de las 77 policies que las referencian, TODAS son `authenticated`; 0 se
--    evalúan para anon/public.
--  · RPC directo: solo current_studio_id() se llama desde el cliente
--    (resolveStudioId en lib/supabase-data.ts), y está GATEADO por sesión
--    (studio-context: si no hay authUserId ni studioIdOverride, ni se intenta).
--    Las rutas públicas resuelven el estudio por slug, no por estas funciones.
--  · Las SECURITY DEFINER que las usan internamente (current_rol llama a
--    current_studio_id; reservar_plaza, etc.) corren como DEFINER → tienen EXECUTE.
--
-- Se cubren ambas vías de grant (explícito a anon Y herencia por PUBLIC) y se
-- re-otorga a los roles legítimos: authenticated (resolveStudioId + RLS) y
-- service_role (jobs de servidor). Idempotente.
--
-- Tras esto, las únicas SECURITY DEFINER ejecutables por anon son
-- slug_estudio_disponible y studio_id_por_slug, que DEBEN seguir públicas
-- (alta pública / portal por slug).

revoke execute on function public.current_rol()       from anon, public;
grant  execute on function public.current_rol()       to authenticated, service_role;

revoke execute on function public.current_studio_id() from anon, public;
grant  execute on function public.current_studio_id() to authenticated, service_role;
