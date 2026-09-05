-- Un tipo de clase pasa a tener DOS imágenes: banner y logo.
--
-- Hasta ahora había una sola, `foto_url`, haciendo los dos trabajos a la vez:
-- el panel la pinta en 44×44 y 48×48 (o sea, como logo) y la app de la alumna
-- la pinta en un héroe de 290 px a sangre (o sea, como banner). Una imagen no
-- puede quedar bien recortada de las dos maneras, y su propio texto de ayuda
-- ya pedía 1600×900 — un formato que como miniatura cuadrada se recorta fatal.
--
-- `foto_url` se queda como el BANNER (es como la consume hoy la pantalla de la
-- alumna, y así la única foto que existe en producción no cambia de sitio) y
-- lo nuevo es `logo_url`, cuadrado, para las filas de clase.
alter table public.tipos_clase add column if not exists logo_url text;

comment on column public.tipos_clase.logo_url is
  'Logo cuadrado del tipo de clase, para filas y listados. El banner ancho de cabecera es foto_url.';

-- El logo se sube al bucket público `avatars`, como el resto de imágenes del
-- panel, con el prefijo `claselogo-<tipoClaseId>`.
--
-- ⚠️ El prefijo NO puede ser `clase-banner-…` ni `banner-clase-…`: la cadena de
-- `elsif` de abajo se evalúa en orden y esos dos caerían en las ramas `clase-%`
-- y `banner-%`, que buscarían un id que no existe en su tabla y RECHAZARÍAN la
-- subida. `claselogo-` no casa con `clase-%` (verificado: `'claselogo-abc' like
-- 'clase-%'` es false, porque el patrón exige el guion justo tras «clase»), y
-- aun así su rama va ANTES para que el orden no dependa de ese detalle.
--
-- Sin cambio de firma: mismo nombre y mismos argumentos, así que
-- `CREATE OR REPLACE` no crea un objeto función nuevo y los grants se
-- mantienen (mismo criterio que 20260813111737_avatars_path_autorizado_network).
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
    -- Logo cuadrado del tipo de clase. Mismo dueño y mismo criterio que su
    -- banner (`clase-%`): el tipo de clase tiene que ser de este estudio.
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
