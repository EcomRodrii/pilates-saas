-- ─────────────────────────────────────────────────────────────────────────────
-- Dar de baja a alguien del equipo NO le quitaba el acceso.
--
-- `instructores.activo = false` es lo que la propietaria pulsa cuando alguien
-- deja el estudio. Salía del listado y de los desplegables, así que parecía
-- hecho — pero ni `current_studio_id()` ni `current_rol()` miraban esa columna.
-- Con su cuenta ya enlazada seguía entrando al panel con su rol intacto: veía
-- clientas, agenda y (si era recepción) el dinero. La baja era cosmética.
--
-- Estas dos funciones deciden TODAS las policies del esquema, así que el cambio
-- es de una línea por consulta y nada más: añadir el filtro donde se busca la
-- ficha de la persona.
--
--   · `coalesce(activo, true)` y no `activo` a secas: solo una baja EXPLÍCITA
--     revoca. Hoy no hay ningún nulo (comprobado), pero si algún camino futuro
--     insertara uno, un `and activo` echaría a esa persona sin que nadie lo
--     hubiera decidido. Fallar hacia "sigue dentro" es lo correcto aquí porque
--     la revocación es un acto deliberado, no un estado por defecto.
--
--   · La rama de la PROPIETARIA (`studios.owner_auth_user_id`) no se toca: la
--     dueña del negocio no puede quedarse fuera de su propio estudio por una
--     ficha de equipo desactivada.
--
--   · Efecto secundario bueno: quien esté de baja en una sede pero activa en
--     otra, ahora aterriza en la sede donde SÍ trabaja en vez de en la primera
--     por orden alfabético.
--
-- Sin cambios de firma ni de permisos: `create or replace` conserva los grants
-- existentes. La UI ya ocultaba a las inactivas; esto cierra la puerta de
-- verdad, que es donde tiene que estar la cerradura.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.current_studio_id()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select sa.studio_id from public.sesion_activa sa
       where sa.auth_user_id = auth.uid()
         and (
           exists (select 1 from public.studios s where s.id = sa.studio_id and s.owner_auth_user_id = auth.uid())
           or exists (select 1 from public.instructores i where i.studio_id = sa.studio_id and i.auth_user_id = auth.uid() and coalesce(i.activo, true))
         )),
    (select studio_id from public.instructores where auth_user_id = auth.uid() and coalesce(activo, true) order by studio_id limit 1),
    (select id from public.studios where owner_auth_user_id = auth.uid() order by id limit 1)
  );
$function$;

create or replace function public.current_rol()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_studio_id text := public.current_studio_id();
begin
  return coalesce(
    (select rol from instructores where auth_user_id = auth.uid() and studio_id = v_studio_id and coalesce(activo, true) limit 1),
    (select 'PROPIETARIO' from studios where owner_auth_user_id = auth.uid() and id = v_studio_id)
  );
end;
$function$;
