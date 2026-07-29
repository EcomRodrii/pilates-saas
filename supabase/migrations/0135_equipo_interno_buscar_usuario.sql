-- ─────────────────────────────────────────────────────────────────────────────
-- Panel interno · pantalla de equipo: resolver un email a su `auth_user_id`.
--
-- Para dar de alta a alguien del equipo hace falta su uuid, y `auth.users` no
-- está expuesta por PostgREST (con razón: es el censo completo de cuentas de
-- todos los estudios). Las alternativas eran peores:
--
--   · `auth.admin.listUsers()` pagina sobre TODOS los usuarios de la app y
--     filtra en memoria — se vuelve más lento cuantos más clientes hay, para
--     una operación que se hace tres veces al año;
--   · exponer `auth.users` por la API, que es exactamente lo que no queremos.
--
-- Así que una función acotada: recibe un email, devuelve un uuid, y nada más.
-- No devuelve la fila, ni el nombre, ni los metadatos — solo el identificador,
-- que es lo único que necesita quien la llama.
--
-- `security definer` porque el que llama no puede leer `auth.users`; y con el
-- `search_path` clavado para que nadie pueda colar un `auth` suyo por delante.
-- El EXECUTE se revoca de todo el mundo y se concede solo a `service_role`:
-- ni `anon` ni `authenticated` la pueden llamar, así que no sirve para
-- comprobar desde fuera si un email tiene cuenta en Tentare.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.plataforma_uid_por_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, pg_temp
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.plataforma_uid_por_email(text) from public, anon, authenticated;
grant execute on function public.plataforma_uid_por_email(text) to service_role;

comment on function public.plataforma_uid_por_email(text) is
  'Panel interno: email -> auth_user_id, para dar de alta a alguien del equipo. Solo service_role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- El equipo interno con su email y su último acceso.
--
-- Deliberadamente NO es una función genérica uuid -> email: hace el join contra
-- `plataforma_admin` por dentro, así que por aquí solo pueden salir los datos
-- de quien ya es del equipo. Una función genérica se habría convertido, el día
-- que alguien la reutilizase, en una forma de sacar el email de cualquier
-- clienta de cualquier estudio.
--
-- `ultimo_acceso` importa para el trabajo real de esta pantalla: una cuenta con
-- acceso al backoffice que lleva medio año sin entrar es una cuenta que sobra.
-- ─────────────────────────────────────────────────────────────────────────────
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
  select a.auth_user_id, u.email::text, a.nombre, a.cargo, a.activo, a.creado_en, u.last_sign_in_at
  from public.plataforma_admin a
  left join auth.users u on u.id = a.auth_user_id
  order by a.activo desc, a.creado_en;
$$;

revoke all on function public.plataforma_equipo() from public, anon, authenticated;
grant execute on function public.plataforma_equipo() to service_role;

comment on function public.plataforma_equipo() is
  'Panel interno: el equipo interno con email y último acceso. Solo service_role.';
