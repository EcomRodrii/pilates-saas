-- Tentare Network, Fase 2 (perfil profesional) — docs/NETWORK-IMPLEMENTATION-PLAN.md §12.
--
-- La foto del perfil de Network se sube al MISMO bucket público `avatars`,
-- con el path `network-<perfilId>`. Igual que con `instructor-%`, la
-- autorización es por dueño (auth_user_id), no por studio_id — un perfil de
-- Network puede no pertenecer a ningún estudio.
--
-- Sin cambio de firma: mismo nombre y mismos argumentos que la versión
-- anterior, así que `CREATE OR REPLACE` NO crea un objeto función nuevo y los
-- grants existentes se mantienen (mismo criterio ya documentado en
-- 20260811015558_avatars_portal_imagenes_editor.sql).

create or replace function public.avatars_path_autorizado(p_name text)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_id text;
begin
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'portal-%' then
    -- Imágenes de los bloques del portal, subidas desde el editor de apariencia.
    -- Prefijo EXACTO con el guion de separación: los ids de estudio llevan
    -- guiones, así que trocear por el primero daría un id a medias.
    return public.current_studio_id() is not null
       and starts_with(p_name, 'portal-' || public.current_studio_id() || '-');
  elsif p_name like 'logo-%' or p_name like 'favicon-%' or p_name like 'admin-%' or p_name like 'bienvenida-%' then
    v_id := substring(p_name from position('-' in p_name) + 1);
    return v_id = public.current_studio_id();
  elsif p_name like 'instructor-%' then
    v_id := substring(p_name from length('instructor-') + 1);
    return exists (
      select 1 from public.instructores i
      where i.id = v_id
        and (i.studio_id = public.current_studio_id() or i.auth_user_id = auth.uid())
    );
  elsif p_name like 'network-%' then
    -- Foto de perfil de Tentare Network — dueño por auth_user_id, nunca por
    -- studio_id (un perfil puede no pertenecer a ningún estudio Tentare).
    v_id := substring(p_name from length('network-') + 1);
    return exists (
      select 1 from public.red_perfiles rp
      where rp.id = v_id and rp.auth_user_id = auth.uid()
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
      where b.id = v_id and b.studio_id = public.current_studio_id()
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
