-- La rama `banner-%` de avatars_path_autorizado comparaba un uuid con un text
-- y REVENTABA: `contenido_portal_banners.id` es uuid, `v_id` sale de
-- `substring(...)` y es text, así que `b.id = v_id` lanza
-- «42883: operator does not exist: uuid = text» en vez de devolver true/false.
--
-- Como la política de storage llama a esta función, el error no se traducía en
-- «no autorizado» sino en un fallo duro: subir la imagen de un banner del
-- portal fallaba SIEMPRE. Es preexistente — se encontró al ejecutar la función
-- en vivo mientras se le añadía la rama del logo de clase. Todas las demás
-- ramas comparan text con text, por eso solo esta estaba afectada.
--
-- Se castea la COLUMNA a text, no `v_id` a uuid: un `v_id::uuid` con un path
-- que no lleve un uuid válido volvería a lanzar en vez de devolver false, que
-- es justo el fallo que se está corrigiendo.
--
-- Sin cambio de firma: `CREATE OR REPLACE` no crea objeto función nuevo y los
-- grants se mantienen (verificado con has_function_privilege tras aplicar).

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
    v_id := substring(p_name from length('network-') + 1);
    return exists (
      select 1 from public.red_perfiles rp
      where rp.id = v_id and rp.auth_user_id = auth.uid()
    );
  elsif p_name like 'claselogo-%' then
    v_id := substring(p_name from length('claselogo-') + 1);
    return exists (
      select 1 from public.tipos_clase t
      where t.id = v_id and t.studio_id = public.current_studio_id()
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
