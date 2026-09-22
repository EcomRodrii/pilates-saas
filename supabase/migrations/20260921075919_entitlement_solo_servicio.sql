-- `socio_tiene_entitlement_activo` pasa a ser solo de servidor.
--
-- ⚠️ Fichero RECUPERADO, no escrito a mano: esta migración se aplicó en
-- producción el 2026-09-21 (versión 20260921075919) y nunca tuvo fichero. Lo
-- cazó el check de deriva (`scripts/comprobar-deriva-migraciones.mjs`), que
-- tuvo main en rojo desde entonces. El cuerpo es literal el de
-- `supabase_migrations.schema_migrations.statements`; el nombre lleva la versión
-- aplicada para que un `db push` desde limpio no la vea pendiente.
--
-- Por qué importa que exista: la última palabra del repo era
-- 20260919074101, que daba EXECUTE a `authenticated`. Quien reconstruyera la BD
-- desde el repo habría vuelto a abrirla a cualquier sesión.
--
-- No rompe la reserva: su único llamante, `reservar_plaza`, es SECURITY DEFINER
-- con dueño `postgres` y ya es solo de servidor (20260919074320). Ningún
-- `.rpc('socio_tiene_entitlement_activo')` en lib/ ni en app/.

revoke execute on function public.socio_tiene_entitlement_activo(text, text, text, date)
  from public, anon, authenticated;
grant execute on function public.socio_tiene_entitlement_activo(text, text, text, date)
  to service_role, postgres;

do $$
begin
  if has_function_privilege('anon', 'public.socio_tiene_entitlement_activo(text,text,text,date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.socio_tiene_entitlement_activo(text,text,text,date)', 'EXECUTE') then
    raise exception 'socio_tiene_entitlement_activo sigue siendo ejecutable por anon/authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.socio_tiene_entitlement_activo(text,text,text,date)', 'EXECUTE') then
    raise exception 'service_role se ha quedado sin EXECUTE sobre socio_tiene_entitlement_activo';
  end if;
end $$;
