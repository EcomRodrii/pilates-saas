-- B1 (F1 seguridad) — Cierra 4 avisos `anon_security_definer_function_executable`
-- de funciones SECURITY DEFINER que NO son públicas.
--
-- mis_estudios / mis_likes_comunidad: solo las llama el rol authenticated
-- (ProfileMenu / comunidad —congelada—). heredar/propagar_plan_de_cadena: internas
-- de cadena (triggers). Verificado antes de aplicar: ninguna se referencia en
-- policies de RLS ni se llama desde contexto anónimo.
--
-- Modelo de permisos (importante):
--  · mis_likes_comunidad tenía un GRANT explícito a anon (migración 0028), así que
--    basta con revocarlo de anon.
--  · las otras 3 heredaban EXECUTE vía PUBLIC (default de Postgres), así que
--    revocar de anon NO surtía efecto → se revoca de PUBLIC y se re-otorga a los
--    roles legítimos (authenticated para RPC/triggers; service_role para servidor).
--
-- NO se tocan slug_estudio_disponible / studio_id_por_slug (el alta pública y el
-- portal por slug las necesitan como anon) ni current_rol / current_studio_id
-- (usadas en RLS — requieren su propio análisis). Idempotente.

revoke execute on function public.mis_likes_comunidad()    from anon;

revoke execute on function public.mis_estudios()           from public;
grant  execute on function public.mis_estudios()           to authenticated, service_role;

revoke execute on function public.heredar_plan_de_cadena() from public;
grant  execute on function public.heredar_plan_de_cadena() to authenticated, service_role;

revoke execute on function public.propagar_plan_cadena()   from public;
grant  execute on function public.propagar_plan_cadena()   to authenticated, service_role;
