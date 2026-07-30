-- ─────────────────────────────────────────────────────────────────────────────
-- Extiende avatars_path_autorizado (20260730140022) con el prefijo
-- `banner-<bannerId>` para las subidas de contenido_portal_banners al bucket
-- avatars. Mismo criterio que el caso `clase-` contra tipos_clase.studio_id:
-- resuelve el studio_id dueño consultando contenido_portal_banners por el id
-- extraído del path y lo compara contra current_studio_id() (staff del
-- estudio activo). Sin esto la subida de banners quedaría sin RLS real —
-- este bucket ya sufrió ese bug exacto una vez (ver 20260730140022).
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
  elsif p_name like 'banner-%' then
    v_id := substring(p_name from length('banner-') + 1);
    return exists (
      select 1 from public.contenido_portal_banners b
      where b.id::text = v_id and b.studio_id = public.current_studio_id()
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
  'Valida que el path de storage.objects (bucket avatars) pertenezca al estudio activo de la sesión, o a la propia persona (instructora/socia), o al banner del portal (studio_id vía contenido_portal_banners). Ver migraciones avatars_valida_path_por_estudio y avatars_banner_path.';
