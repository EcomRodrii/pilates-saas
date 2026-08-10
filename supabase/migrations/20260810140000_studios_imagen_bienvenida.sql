-- `studios.foto_url` nació SOLO como foto de perfil de la propietaria
-- (0071_foto_perfil_propietaria_instructora.sql) pero el portal la reutiliza
-- como imagen de bienvenida/portada para TODAS las alumnas (BienvenidaPortal,
-- PortadaAcceso, hero de inicio, banner "invita a una amiga", encuadre del
-- editor de temas). Dos contextos distintos —selfie de la dueña vs. imagen
-- de marca para clientas— compartiendo un solo campo: si la propietaria sube
-- su foto de perfil para el sidebar del panel, esa misma foto aparece de
-- golpe como bienvenida a toda socia que entra al portal.
--
-- Columna nueva y NADA de migrar el valor de foto_url: lo que hay hoy ahí es
-- la foto de la propietaria, no necesariamente algo que quiera enseñar a sus
-- alumnas. Empieza vacía; el portal ya tiene un fallback sin foto (color de
-- marca liso) para cuando no hay nada que mostrar.
--
-- Hereda la RLS que ya tiene `studios` (UPDATE solo PROPIETARIO) — es una
-- columna más de la misma tabla, sin política nueva.
alter table public.studios add column imagen_bienvenida_url text;

-- Storage (bucket "avatars"): la imagen se sube a `bienvenida-<studioId>`,
-- prefijo nuevo que `avatars_path_autorizado` todavía no reconoce — sin esto
-- caería en la rama genérica (comparación contra `socios.id`) y la propia
-- propietaria no podría subir su imagen de bienvenida. Mismo patrón que
-- `admin-%`/`logo-%`/`favicon-%`: el id tras el guion debe ser el estudio
-- activo de la sesión. Firma sin cambios (text -> boolean): no resetea los
-- grants ya endurecidos (mismo criterio que 20260804021002).
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
  if p_name like 'favicon-borrador-%' then
    v_id := substring(p_name from length('favicon-borrador-') + 1);
    return v_id = public.current_studio_id();
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

comment on function public.avatars_path_autorizado(text) is
  'Valida que el path de storage.objects (bucket avatars) pertenezca al estudio activo de la sesión, o a la propia persona (instructora/socia). bienvenida-<id> es la imagen de bienvenida/portada del portal (studios.imagen_bienvenida_url); ver migración 20260810140000_studios_imagen_bienvenida.';
