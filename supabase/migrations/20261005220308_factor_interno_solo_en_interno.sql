-- El factor de la zona interna solo cuenta en la zona interna (5-oct-2026,
-- decisión del fundador: «solo en interno»).
--
-- `/interno` exige `aal2` a quien es del equipo de Tentare y, si no tiene
-- factor, le obliga a crear uno (`app/interno/mfa`, nombre 'Tentare Internal').
-- El factor de Supabase es UNO por cuenta, así que ese factor encendía también
-- la verificación en el panel y en la app del estudio: se pedía el código en
-- todas partes, y «Desactivar» en el panel solo duraba hasta volver a /interno.
--
-- Desde aquí, «tiene la verificación activada» (regla A) cuenta solo los
-- factores verificados que NO son el de la zona interna. La zona interna no
-- cambia: sigue exigiendo `aal2` con cualquier factor (lib/interno/auth.ts).
--
-- El nombre lo pone el navegador al crear el factor, pero no abre nada: con un
-- factor ya verificado, crear otro exige `aal2` (GoTrue), así que solo quien ya
-- ha pasado el segundo paso podría nombrar así uno suyo, y solo para sí misma.
-- La misma regla en TypeScript: `factoresVerificados` (lib/auth/doble-factor-reglas.ts).

create or replace function public.tiene_factor_de_cuenta(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_usuario is not null and exists (
    select 1 from auth.mfa_factors f
     where f.user_id = p_usuario and f.status = 'verified'
       and f.friendly_name is distinct from 'Tentare Internal'
  );
$$;

-- Solo la llaman otras funciones SECURITY DEFINER (corren como su dueño).
revoke execute on function public.tiene_factor_de_cuenta(uuid) from public;
revoke execute on function public.tiene_factor_de_cuenta(uuid) from anon;
revoke execute on function public.tiene_factor_de_cuenta(uuid) from authenticated;
grant execute on function public.tiene_factor_de_cuenta(uuid) to service_role;

create or replace function public.nivel_acceso_suficiente()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  -- Sin usuario no hay factor que buscar: la regla no aplica y deciden las
  -- demás políticas, que sin estudio no dan nada.
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not public.tiene_factor_de_cuenta(auth.uid())
      or public.sesion_de_confianza();
$$;

create or replace function public.sesion_confiada_de(p_usuario uuid, p_sesion uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_usuario is not null and p_sesion is not null
     and exists (
       select 1 from public.sesiones_confiadas s
         left join public.dispositivos_confianza d on d.id = s.dispositivo_id and d.auth_user_id = s.auth_user_id
        where s.session_id = p_sesion and s.auth_user_id = p_usuario
          and (
            (s.origen = 'dispositivo' and d.caduca_en > now())
            or (s.origen = 'correo' and s.dispositivo_id is null)
          )
     )
     and public.tiene_factor_de_cuenta(p_usuario);
$$;

create or replace function public.correo_doble_factor_disponible(p_usuario uuid, p_sesion uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when p_usuario is null or p_sesion is null
      or not exists (select 1 from auth.sessions se where se.id = p_sesion and se.user_id = p_usuario)
      then 'sin_sesion'
    when not public.tiene_factor_de_cuenta(p_usuario)
      then 'sin_verificacion'
    -- Solo contraseña como primer paso (lista blanca: un método desconocido dice que no).
    when not exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method = 'password')
      or exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method not in ('password', 'totp'))
      then 'sin_contrasena'
    when exists (select 1 from public.doble_factor_correo_bloqueos b where b.auth_user_id = p_usuario)
      then 'bloqueado'
  end;
$$;

create or replace function public.current_studio_id()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  with candidata as (
    select coalesce(
      (select sa.studio_id from public.sesion_activa sa
         where sa.auth_user_id = auth.uid()
           and (
             exists (select 1 from public.studios s where s.id = sa.studio_id and s.owner_auth_user_id = auth.uid())
             or exists (select 1 from public.instructores i where i.studio_id = sa.studio_id and i.auth_user_id = auth.uid() and coalesce(i.activo, true))
           )),
      (select studio_id from public.instructores where auth_user_id = auth.uid() and coalesce(activo, true) order by studio_id limit 1),
      (select id from public.studios where owner_auth_user_id = auth.uid() order by id limit 1)
    ) as id
  )
  select case
    -- Sesión verificada, o confiada por un dispositivo recordado: como siempre.
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' or public.sesion_de_confianza() then c.id
    -- Regla A: tiene la verificación activada y esta sesión no la ha pasado.
    when public.tiene_factor_de_cuenta(auth.uid()) then null
    -- Regla B: su estudio la exige y su papel ahí es del panel (mismo orden que current_rol()).
    when exists (select 1 from public.studios s where s.id = c.id and s.exigir_doble_factor)
         and coalesce(
               (select i.rol from public.instructores i
                 where i.auth_user_id = auth.uid() and i.studio_id = c.id and coalesce(i.activo, true) limit 1),
               'PROPIETARIO') <> 'INSTRUCTOR'
      then null
    else c.id
  end
  from candidata c;
$$;

-- Permisos, por escrito (CREATE OR REPLACE conserva los que ya tenían; esto
-- solo deja constancia y es idempotente). anon no ejecuta ninguna. Las dos que
-- llaman las políticas siguen para authenticated; las otras dos, solo el servidor.
revoke all on function public.nivel_acceso_suficiente() from public, anon;
grant execute on function public.nivel_acceso_suficiente() to authenticated, service_role;
revoke all on function public.current_studio_id() from public, anon;
grant execute on function public.current_studio_id() to authenticated, service_role;
revoke all on function public.sesion_confiada_de(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sesion_confiada_de(uuid, uuid) to service_role;
revoke all on function public.correo_doble_factor_disponible(uuid, uuid) from public, anon, authenticated;
grant execute on function public.correo_doble_factor_disponible(uuid, uuid) to service_role;
