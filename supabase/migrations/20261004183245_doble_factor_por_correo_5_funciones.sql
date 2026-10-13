-- Segundo paso por correo, La regla única (`sesion_confiada_de`), cuándo vale el correo, contar un intento y confirmar.
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).

create or replace function public.sesion_confiada_de(p_usuario uuid, p_sesion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
     and exists (
       select 1 from auth.mfa_factors f where f.user_id = p_usuario and f.status = 'verified'
     );
$$;

create or replace function public.correo_doble_factor_disponible(p_usuario uuid, p_sesion uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_usuario is null or p_sesion is null
      or not exists (select 1 from auth.sessions se where se.id = p_sesion and se.user_id = p_usuario)
      then 'sin_sesion'
    when not exists (select 1 from auth.mfa_factors f where f.user_id = p_usuario and f.status = 'verified')
      then 'sin_verificacion'
    when not exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method = 'password')
      or exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method not in ('password', 'totp'))
      then 'sin_contrasena'
    when exists (select 1 from public.doble_factor_correo_bloqueos b where b.auth_user_id = p_usuario)
      then 'bloqueado'
  end;
$$;

comment on function public.correo_doble_factor_disponible(uuid, uuid) is
  'null si esa sesión puede pasar el segundo paso con un código por correo; si no, el motivo. Solo servidor.';

create or replace function public.intento_codigo_correo(p_usuario uuid, p_sesion uuid, p_max_intentos int)
returns table (estado text, codigo_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila public.codigos_correo_doble_factor;
begin
  if public.correo_doble_factor_disponible(p_usuario, p_sesion) is not null then
    return query select 'no_disponible'::text, null::text;
    return;
  end if;
  select c.* into v_fila from public.codigos_correo_doble_factor c
   where c.session_id = p_sesion and c.auth_user_id = p_usuario
   for update;
  if v_fila.session_id is null or v_fila.usado_en is not null then
    return query select 'sin_codigo'::text, null::text;
    return;
  end if;
  if v_fila.caduca_en <= now() then
    return query select 'caducado'::text, null::text;
    return;
  end if;
  if v_fila.intentos >= p_max_intentos then
    return query select 'agotado'::text, null::text;
    return;
  end if;
  update public.codigos_correo_doble_factor c set intentos = c.intentos + 1
   where c.session_id = p_sesion and c.auth_user_id = p_usuario;
  return query select 'vivo'::text, v_fila.codigo_hash;
end;
$$;

create or replace function public.confirmar_codigo_correo(p_usuario uuid, p_sesion uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gastado uuid;
begin
  if public.correo_doble_factor_disponible(p_usuario, p_sesion) is not null then
    return false;
  end if;
  update public.codigos_correo_doble_factor c set usado_en = now()
   where c.session_id = p_sesion and c.auth_user_id = p_usuario and c.codigo_hash = p_hash
     and c.usado_en is null and c.caduca_en > now()
     and c.intentos > 0
  returning c.session_id into v_gastado;
  if v_gastado is null then
    return false;
  end if;
  insert into public.sesiones_confiadas (session_id, auth_user_id, dispositivo_id, origen)
  values (p_sesion, p_usuario, null, 'correo')
  on conflict (session_id) do update
    set dispositivo_id = null, origen = 'correo', creada_en = now()
    where public.sesiones_confiadas.auth_user_id = excluded.auth_user_id;
  return true;
end;
$$;

revoke all on function public.sesion_confiada_de(uuid, uuid) from public, anon;
revoke all on function public.sesion_confiada_de(uuid, uuid) from authenticated;
grant execute on function public.sesion_confiada_de(uuid, uuid) to service_role;
revoke all on function public.correo_doble_factor_disponible(uuid, uuid) from public, anon;
revoke all on function public.correo_doble_factor_disponible(uuid, uuid) from authenticated;
grant execute on function public.correo_doble_factor_disponible(uuid, uuid) to service_role;
revoke all on function public.intento_codigo_correo(uuid, uuid, int) from public, anon;
revoke all on function public.intento_codigo_correo(uuid, uuid, int) from authenticated;
grant execute on function public.intento_codigo_correo(uuid, uuid, int) to service_role;
revoke all on function public.confirmar_codigo_correo(uuid, uuid, text) from public, anon;
revoke all on function public.confirmar_codigo_correo(uuid, uuid, text) from authenticated;
grant execute on function public.confirmar_codigo_correo(uuid, uuid, text) to service_role;
