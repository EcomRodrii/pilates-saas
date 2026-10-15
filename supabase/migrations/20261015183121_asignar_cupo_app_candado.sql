-- `asignar_cupo_app` con un candado por estudio.
--
-- Dos peticiones del MISMO estudio a la vez (dos pestañas) no se veían: la segunda, con su
-- instantánea, no encontraba el hueco que la primera acababa de coger, se llevaba OTRO
-- (`skip locked`) y chocaba con la UNIQUE de `studio_id`. La ruta lo tomaba por «no hay lote» y
-- caía al identificador del slug: el estudio se quedaba con una app sin crear en App Store Connect
-- y con un hueco cogido y sin usar. Con el candado, la segunda espera a la primera y, al leer de
-- nuevo, encuentra el hueco que ya es suyo.
--
-- Misma firma: conserva los permisos. Se repiten igualmente (solo service_role), por si acaso.
create or replace function public.asignar_cupo_app(p_studio_id text) returns text
language plpgsql security definer set search_path = public as $$
declare v_bundle text;
begin
  perform pg_advisory_xact_lock(hashtext('asignar_cupo_app:' || p_studio_id));
  select c.bundle_id into v_bundle from public.apps_estudio_cupos c where c.studio_id = p_studio_id;
  if v_bundle is not null then return v_bundle; end if;
  select c.bundle_id into v_bundle from public.apps_estudio_cupos c
   where c.studio_id is null order by c.bundle_id limit 1 for update skip locked;
  if v_bundle is null then return null; end if;
  update public.apps_estudio_cupos set studio_id = p_studio_id, asignado_en = now() where bundle_id = v_bundle;
  return v_bundle;
end $$;

revoke all on function public.asignar_cupo_app(text) from public;
revoke all on function public.asignar_cupo_app(text) from anon;
revoke all on function public.asignar_cupo_app(text) from authenticated;
grant execute on function public.asignar_cupo_app(text) to service_role;
