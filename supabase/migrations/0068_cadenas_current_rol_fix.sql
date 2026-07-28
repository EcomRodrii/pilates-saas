-- Hotfix de 0065: current_rol() perdió el `limit 1` que sí tenía la versión
-- original (0000_base.sql) en su subconsulta de `instructores`. Sin él, un
-- usuario con dos fichas de `instructores` para el mismo (auth_user_id,
-- studio_id) —alcanzable hoy con el alta de equipo + self-claim existentes,
-- sin ningún UNIQUE que lo impida— hace que la subconsulta escalar devuelva
-- más de una fila y Postgres lance "more than one row returned by a
-- subquery used as an expression". Como current_rol() la llaman ~20+
-- policies de RLS, ese usuario queda bloqueado de TODO el panel.
--
-- De paso: current_rol() llamaba a current_studio_id() dos veces (una por
-- rama del coalesce) — con las policies que ya combinan ambas funciones en
-- la misma condición (ej. owner_studios), current_studio_id() se evaluaba
-- hasta 3 veces por fila. Reescrita en plpgsql con una variable local que
-- calcula current_studio_id() una sola vez, baja a 2.
create or replace function public.current_rol() returns text
  language plpgsql stable security definer
  set search_path = public
  as $$
declare
  v_studio_id text := public.current_studio_id();
begin
  return coalesce(
    (select rol from instructores where auth_user_id = auth.uid() and studio_id = v_studio_id limit 1),
    (select 'PROPIETARIO' from studios where owner_auth_user_id = auth.uid() and id = v_studio_id)
  );
end;
$$;
