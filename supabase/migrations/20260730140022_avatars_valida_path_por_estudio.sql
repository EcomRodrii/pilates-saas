-- ─────────────────────────────────────────────────────────────────────────────
-- Las policies de storage.objects para el bucket "avatars" solo comprobaban
-- bucket_id = 'avatars' en INSERT/UPDATE/DELETE — cualquier authenticated podía
-- sobrescribir o borrar la marca de OTRO estudio (logo, favicon, foto de
-- propietaria/instructora/socia) si conocía o filtraba el UUID, porque los
-- paths son predecibles (`logo-<studioId>`, `instructor-<id>`, etc.) y nunca se
-- validaban contra la sesión. Documentado como follow-up pendiente por el autor
-- de la 20260723141717 (avatars_bucket_lockdown); la 20260729004038 solo cerró
-- el SELECT, no esto.
--
-- Severidad media (desfiguración de imágenes públicas de marca, no lectura de
-- datos privados), pero cierra la puerta de verdad: la RLS, no la UI.
--
-- avatars_path_autorizado(name) decide, según el prefijo del path, contra qué
-- tabla comprobar la pertenencia:
--   logo-/favicon-/admin-<studioId>   -> el studioId debe ser el estudio activo
--                                        de la sesión (current_studio_id()).
--   instructor-<id>                   -> esa instructora debe pertenecer al
--                                        estudio activo del staff, O ser ella
--                                        misma editando su propia foto.
--   clase-<id>                        -> ese tipo de clase debe pertenecer al
--                                        estudio activo del staff.
--   (sin prefijo, es el id de socios)  -> esa socia debe pertenecer al estudio
--                                        activo del staff, O ser ella misma
--                                        editando su propia foto (portal).
--
-- Verificado en vivo (transacción con rollback, project dwqvdycjcffqwfkzapvi)
-- contra datos reales de studio-1: staff sobre su propio logo/instructor/socia
-- -> true; staff sobre logo de otro estudio -> false; socia sobre su propia
-- foto -> true; socia sobre foto ajena, logo o instructor de su estudio ->
-- false/null (RLS trata null como rechazo).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.avatars_path_autorizado(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_id text;
begin
  if p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'admin-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (i.studio_id = public.current_studio_id() or i.auth_user_id = auth.uid())
    );
  elsif p_name like 'clase-%' then
    v_id := substring(p_name from length('clase-') + 1);
    return exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = public.current_studio_id()
    );
  else
    return exists (
      select 1 from public.socios so
      where so.id = p_name
        and (so.studio_id = public.current_studio_id() or so.auth_user_id = auth.uid())
    );
  end if;
end;
$function$;

comment on function public.avatars_path_autorizado(text) is
  'Valida que el path de storage.objects (bucket avatars) pertenezca al estudio activo de la sesión, o a la propia persona (instructora/socia). Ver migración avatars_valida_path_por_estudio.';

grant execute on function public.avatars_path_autorizado(text) to authenticated;

drop policy if exists avatars_insert_authenticated on storage.objects;
drop policy if exists avatars_update_authenticated on storage.objects;
drop policy if exists avatars_delete_authenticated on storage.objects;

create policy avatars_insert_autorizado on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatars_path_autorizado(name));

create policy avatars_update_autorizado on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.avatars_path_autorizado(name))
  with check (bucket_id = 'avatars' and public.avatars_path_autorizado(name));

create policy avatars_delete_autorizado on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.avatars_path_autorizado(name));
