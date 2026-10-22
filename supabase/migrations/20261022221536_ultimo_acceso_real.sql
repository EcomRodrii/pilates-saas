-- «Último acceso» de /interno mentía: leía auth.users.last_sign_in_at, que solo se
-- mueve cuando alguien escribe su contraseña o un código. Quien no cierra sesión
-- sigue entrando cada día con el token refrescado y esa fecha se queda vieja
-- (medido: una cuenta con login de hace 10 días y sesión renovada hoy).
-- La actividad real es la última renovación de sus sesiones.
create or replace function public.ultimo_acceso_real(p_user_ids uuid[])
returns table (user_id uuid, ultimo timestamptz)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id,
         greatest(
           u.last_sign_in_at,
           (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id)
         )
  from auth.users u
  where u.id = any(p_user_ids);
$$;

revoke all on function public.ultimo_acceso_real(uuid[]) from public, anon, authenticated;
grant execute on function public.ultimo_acceso_real(uuid[]) to service_role;

-- Misma firma que antes: la pantalla del equipo interno sigue leyendo `ultimo_acceso`.
create or replace function public.plataforma_equipo()
returns table (
  auth_user_id uuid,
  email text,
  nombre text,
  cargo text,
  activo boolean,
  creado_en timestamptz,
  ultimo_acceso timestamptz
)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select a.auth_user_id, u.email::text, a.nombre, a.cargo, a.activo, a.creado_en,
         greatest(
           u.last_sign_in_at,
           (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id)
         )
  from public.plataforma_admin a
  left join auth.users u on u.id = a.auth_user_id
  order by a.activo desc, a.creado_en;
$$;

revoke all on function public.plataforma_equipo() from public, anon, authenticated;
grant execute on function public.plataforma_equipo() to service_role;
