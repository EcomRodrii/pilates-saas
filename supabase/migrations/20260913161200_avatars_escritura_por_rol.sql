-- Bucket público `avatars`: la ESCRITURA pasa a mirar el rol.
--
-- `avatars_path_autorizado(name)` decidía SELECT, INSERT, UPDATE y DELETE solo
-- por pertenecer al estudio, sin mirar el rol: la escritura de imágenes de
-- marca y de fotos de otras personas no seguía el mismo criterio que el panel.
--
-- La LECTURA no cambia (sigue en `avatars_path_autorizado`, no se toca). La
-- escritura va a una función nueva con el mismo árbol de prefijos y el rol de
-- quien hace hoy esa subida en el panel. Espejo TS y test de contrato en
-- lib/avatars-escritura.ts / lib/avatars-escritura.test.ts.
--
--   favicon-borrador-, portal-, logo-, favicon-, bienvenida-, banner-,
--   clase-, claselogo-         → PROPIETARIO o MANAGER
--   admin-<studio>             → PROPIETARIO (foto de perfil de la propietaria)
--   producto-<id>              → puede_mover_dinero() (RLS de productos_pos)
--   instructor-<id>            → la propia instructora, o
--                                puede_gestionar_ficha_instructor(id) en su estudio
--   network-<perfil>           → la dueña del perfil (sin cambios)
--   <socio_id>                 → la propia socia, o puede_gestionar_clientas()
--
-- `favicon-<studio>` (publicado) lo escribe publicarTheme() con service_role,
-- que no pasa por RLS; su rama se mantiene con el criterio de marca.

create or replace function public.avatars_path_escribible(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_id text;
  v_studio text := public.current_studio_id();
  v_rol text := public.current_rol();
begin
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return coalesce(v_id = v_studio and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'portal-%' then
    return coalesce(
      v_studio is not null
      and starts_with(p_name, 'portal-' || v_studio || '-')
      and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'admin-%' then
    v_id := substring(p_name from length('admin-') + 1);
    return coalesce(v_id = v_studio and v_rol = 'PROPIETARIO', false);
  elsif p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'bienvenida-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return coalesce(v_id = v_studio and v_rol in ('PROPIETARIO', 'MANAGER'), false);
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (
          i.auth_user_id = auth.uid()
          or (i.studio_id = v_studio and public.puede_gestionar_ficha_instructor(i.id))
        )
    );
  elsif p_name like 'network-%' then
    v_id := substring(p_name from length('network-') + 1);
    return exists (
      select 1 from public.red_perfiles rp
      where rp.id = v_id and rp.auth_user_id = auth.uid()
    );
  elsif p_name like 'claselogo-%' then
    v_id := substring(p_name from length('claselogo-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = v_studio
    );
  elsif p_name like 'clase-%' then
    v_id := substring(p_name from length('clase-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = v_studio
    );
  elsif p_name like 'banner-%' then
    v_id := substring(p_name from length('banner-') + 1);
    return coalesce(v_rol in ('PROPIETARIO', 'MANAGER'), false) and exists (
      select 1 from public.contenido_portal_banners b
      where b.id::text = v_id and b.studio_id = v_studio
    );
  elsif p_name like 'producto-%' then
    v_id := substring(p_name from length('producto-') + 1);
    return coalesce(public.puede_mover_dinero(), false) and exists (
      select 1 from public.productos_pos p
      where p.id = v_id and p.studio_id = v_studio
    );
  else
    return exists (
      select 1 from public.socios so
      where so.id = p_name
        and (
          so.auth_user_id = auth.uid()
          or (so.studio_id = v_studio and public.puede_gestionar_clientas())
        )
    );
  end if;
end;
$function$;

comment on function public.avatars_path_escribible(text) is
  'Bucket avatars: ¿puede la sesión subir/sustituir/borrar este path? Árbol de prefijos de avatars_path_autorizado + rol. Espejo TS: lib/avatars-escritura.ts.';

-- pg_default_acl concede EXECUTE DIRECTO a anon/authenticated en funciones
-- nuevas: REVOKE PUBLIC solo no basta. authenticated lo necesita porque la
-- policy se evalúa con sus privilegios.
revoke execute on function public.avatars_path_escribible(text) from public;
revoke execute on function public.avatars_path_escribible(text) from anon;
grant execute on function public.avatars_path_escribible(text) to authenticated;
grant execute on function public.avatars_path_escribible(text) to service_role;

-- SELECT (avatars_select_autorizado) NO se toca: sigue con avatars_path_autorizado.
drop policy if exists avatars_insert_autorizado on storage.objects;
create policy avatars_insert_autorizado on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatars_path_escribible(name));

drop policy if exists avatars_update_autorizado on storage.objects;
create policy avatars_update_autorizado on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.avatars_path_escribible(name))
  with check (bucket_id = 'avatars' and public.avatars_path_escribible(name));

drop policy if exists avatars_delete_autorizado on storage.objects;
create policy avatars_delete_autorizado on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.avatars_path_escribible(name));

-- Verificación tras aplicar (esperado: false / true):
--   select has_function_privilege('anon', 'public.avatars_path_escribible(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.avatars_path_escribible(text)', 'EXECUTE');
-- Pruebas por rol (en rama/staging, nunca en prod): scripts/verify-rgpd-network-storage.sql
