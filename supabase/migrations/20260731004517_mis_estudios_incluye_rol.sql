-- P2-14: el selector de sede (SedeActiva) necesita mostrar el rol efectivo
-- de la instructora en CADA sede — puede ser PROPIETARIO en una y
-- INSTRUCTOR en otra. mis_estudios() cambia de firma (gana la columna
-- `rol`), así que Postgres crea un objeto función nuevo con EXECUTE por
-- defecto a PUBLIC — mismo gotcha de grants ya pisado varias veces en este
-- repo (Fase 2a/2b/3): hay que REVOKE + GRANT explícito, no basta con
-- REVOKE FROM anon.
drop function if exists public.mis_estudios();

create function public.mis_estudios() returns table(id text, nombre text, slug text, ciudad text, rol text)
  language sql stable security definer
  set search_path to 'public', 'pg_temp' as $$
  select s.id, s.nombre, s.slug, s.ciudad,
    coalesce(
      case when s.owner_auth_user_id = auth.uid() then 'PROPIETARIO' end,
      (select i.rol from public.instructores i where i.studio_id = s.id and i.auth_user_id = auth.uid() limit 1)
    ) as rol
  from public.studios s
  where s.owner_auth_user_id = auth.uid()
     or exists (select 1 from public.instructores i where i.studio_id = s.id and i.auth_user_id = auth.uid());
$$;

revoke all on function public.mis_estudios() from public, anon;
grant execute on function public.mis_estudios() to authenticated, service_role, postgres;
