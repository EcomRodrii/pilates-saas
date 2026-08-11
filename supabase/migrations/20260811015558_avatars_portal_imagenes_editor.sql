-- Las imágenes que se suben DESDE el editor de apariencia no podían subirse.
--
-- `subirImagenPortal` (lib/portal-storage.ts) escribe en
-- `portal-<studioId>-<clave>`, pero `avatars_path_autorizado` no tenía ninguna
-- rama para ese prefijo: caía al `else`, que busca una socia cuyo id sea el
-- path entero, no la encontraba, y devolvía false. Las CUATRO políticas del
-- bucket (select/insert/update/delete) cuelgan de esta función, así que la
-- subida moría con "new row violates row-level security policy".
--
-- El código de la subida se desplegó sin su política. Visto en producción al
-- intentar poner una foto en un bloque del portal.
--
-- La comprobación es de prefijo EXACTO, con el guion de separación incluido:
-- `starts_with(p_name, 'portal-' || current_studio_id() || '-')`. No se parte
-- el path por el primer guion —como hace la rama de logo/favicon— porque los
-- ids de estudio LLEVAN guiones (`studio-1786109058889-vus9nj`) y ahí el
-- troceo daría un id a medias.
--
-- ⚠️ Queda un caso teórico que conviene tener escrito: si el id de un estudio
-- fuera prefijo del de otro seguido de guion (`studio-1` y `studio-1-x`), el
-- primero pasaría la comprobación sobre los ficheros del segundo. Hoy no
-- ocurre —los ids salen de `studio-${uid()}` y del sembrado `studio-1`— y
-- cerrarlo del todo exigiría cambiar el formato del path, que ya está
-- desplegado y con ficheros dentro. Si algún día se genera un id así, esto hay
-- que revisarlo.
--
-- Sin cambio de firma: `CREATE OR REPLACE` sobre el mismo nombre y los mismos
-- argumentos NO crea un objeto función nuevo, así que los grants existentes se
-- mantienen y no hace falta re-endurecerlos (a diferencia del caso de
-- `reservar_plaza`/`cancelar_reserva_plaza`, que sí cambiaron de firma).

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
    -- Imágenes de los bloques del portal, subidas desde el editor.
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
