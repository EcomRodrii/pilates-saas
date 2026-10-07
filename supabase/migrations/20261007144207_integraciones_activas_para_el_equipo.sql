-- Qué conexiones tiene encendidas el estudio, para TODO el equipo del panel
-- (propietaria, gerencia y recepción): solo el TIPO, ni credenciales ni salud.
--
-- `integraciones` solo la lee la propietaria (`owner_integraciones_lectura`,
-- migr 20260930110315): lleva la salud del servicio y, en `config`, las
-- credenciales cifradas. Pero el panel sacaba de esa misma tabla qué
-- plataformas venden plazas y si hay cerradura, y para el resto del equipo
-- venía vacía:
--  · recepción y gerencia no veían «Añadir → ClassPass» en la hoja de la clase
--    ni las plazas cedidas por tipo, y son quienes apuntan esas ventas a mano;
--  · el check-in de recepción no abría la puerta con Kisi.
-- Los e2e no lo veían: entran como propietaria y simulan la tabla.
--
-- SECURITY DEFINER para saltar la RLS de la tabla, y por eso decide ella misma
-- quién y qué: el estudio de la sesión (`current_studio_id()`, que ya devuelve
-- null a una sesión sin el segundo paso cuando hace falta) y solo los papeles
-- del panel. La instructora no trabaja en el panel.

create or replace function public.integraciones_activas()
returns setof text
language sql
stable
security definer
set search_path = ''
as $function$
  select i.tipo
    from public.integraciones as i
   where i.studio_id = public.current_studio_id()
     and i.activo
     and public.current_rol() in ('PROPIETARIO', 'MANAGER', 'RECEPCION')
   order by i.tipo;
$function$;

-- Por escrito (rgpd-grants-anon-guardias-contrato): la llama el panel con la
-- sesión del equipo; anon, nunca.
revoke execute on function public.integraciones_activas() from public, anon;
grant execute on function public.integraciones_activas() to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.integraciones_activas()', 'execute')
     or not has_function_privilege('authenticated', 'public.integraciones_activas()', 'execute')
     or not has_function_privilege('service_role', 'public.integraciones_activas()', 'execute') then
    raise exception 'integraciones_activas: permisos distintos de lo previsto';
  end if;
end $$;
