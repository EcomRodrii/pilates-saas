-- Bucket privado `red-documentos-identidad`: subir exige tener perfil de Network.
--
-- La policy de INSERT solo pedía que el primer segmento del path fuera el propio
-- `auth.uid()`, sin exigir perfil de Network. Todos los flujos legítimos
-- (identidad, certificaciones, portfolio) exigen ya el perfil en su endpoint de
-- registro; ahora el bucket también.
--
-- ⚠️ No vale un `exists (select 1 from public.red_perfiles …)` directo en la
-- policy: `authenticated` NO tiene grant de tabla sobre `red_perfiles`, y la
-- policy se evalúa con sus privilegios → «permission denied» en toda subida.
-- De ahí el helper SECURITY DEFINER, que solo responde sí/no sobre la PROPIA
-- cuenta y no recibe argumentos.

create or replace function public.red_tiene_perfil_propio()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.red_perfiles rp
    where rp.auth_user_id = (select auth.uid())
  );
$function$;

comment on function public.red_tiene_perfil_propio() is
  'true si la cuenta que llama tiene perfil en red_perfiles. Solo para la policy de INSERT de red-documentos-identidad.';

-- pg_default_acl de este proyecto concede EXECUTE DIRECTO a anon/authenticated
-- en toda función nueva: revocar PUBLIC no basta (tentare-os.md).
revoke execute on function public.red_tiene_perfil_propio() from public;
revoke execute on function public.red_tiene_perfil_propio() from anon;
grant execute on function public.red_tiene_perfil_propio() to authenticated;
grant execute on function public.red_tiene_perfil_propio() to service_role;

drop policy if exists red_documentos_identidad_insert_propio on storage.objects;
create policy red_documentos_identidad_insert_propio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'red-documentos-identidad'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.red_tiene_perfil_propio()
  );

-- Verificación tras aplicar (esperado: false / true / true):
--   select has_function_privilege('anon', 'public.red_tiene_perfil_propio()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.red_tiene_perfil_propio()', 'EXECUTE'),
--          has_function_privilege('service_role', 'public.red_tiene_perfil_propio()', 'EXECUTE');
