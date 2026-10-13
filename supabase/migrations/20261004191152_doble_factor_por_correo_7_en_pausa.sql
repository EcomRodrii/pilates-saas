-- ═══════════════════════════════════════════════════════════════════════════
-- Segundo paso por correo, trozo 7: el último de los seis con registro (no hay un «6», ver abajo).
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ Esta migración se aplicó en producción en SEIS trozos (4-oct-2026), cada uno
-- con su versión y su nombre, y el repo la tenía en un solo fichero
-- (20261003160000_doble_factor_por_correo.sql). Supabase compara VERSIONES: con
-- el fichero único, «Supabase Preview» fallaba («Remote migration versions not
-- found in local migrations directory») y un `db push` la habría vuelto a
-- aplicar entera. Partida el 14-oct-2026 con el SQL EXACTO de cada trozo
-- (`supabase_migrations.schema_migrations.statements`, comprobado por md5).

-- En pausa hasta que estén los triggers de cambio de contraseña/correo: sin
-- ellos el correo no se bloquea tras restablecer la contraseña. 'bloqueado'
-- para todos = segundo paso solo con la app (como antes de esta migración).
create or replace function public.correo_doble_factor_disponible(p_usuario uuid, p_sesion uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'bloqueado'::text;
$$;
revoke all on function public.correo_doble_factor_disponible(uuid, uuid) from public, anon;
revoke all on function public.correo_doble_factor_disponible(uuid, uuid) from authenticated;
grant execute on function public.correo_doble_factor_disponible(uuid, uuid) to service_role;

-- ── Parte 6 (sin registro propio en producción) ──────────────────────────
-- Los triggers de cambio de contraseña y de correo, y quitar el factor. En
-- producción se aplicaron SIN fila en `schema_migrations` (no hay «_6»), pero
-- existen: comprobado el 14-oct-2026 que el cuerpo de las tres funciones es
-- idéntico a este (md5 de `prosrc`) y que `trg_bloquear_correo_doble_factor`
-- está en `auth.users`. Van aquí, tras la pausa (el orden en que se
-- aplicaron), para que una base nueva quede como producción. La pausa la
-- levantó 20261005220308 (`correo_doble_factor_disponible` completa otra vez).

-- ── Cambiar la contraseña: fuera dispositivos, sesiones confiadas, y el
-- correo deja de valer hasta pasar la app ────────────────────────────────────
-- Misma firma que en 20261003110108; ahora también borra las sesiones
-- confiadas por correo (las de dispositivo ya caían en cascada) y apunta la marca.
create or replace function public.olvidar_dispositivos_al_cambiar_contrasena()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dispositivos_confianza where auth_user_id = new.id;
  delete from public.sesiones_confiadas where auth_user_id = new.id;
  insert into public.doble_factor_correo_bloqueos (auth_user_id, desde, motivo)
  values (new.id, now(), 'contrasena')
  on conflict (auth_user_id) do update set desde = excluded.desde, motivo = excluded.motivo;
  return new;
end;
$$;

revoke all on function public.olvidar_dispositivos_al_cambiar_contrasena() from public, anon;
revoke all on function public.olvidar_dispositivos_al_cambiar_contrasena() from authenticated;

-- ── Cambiar el correo: lo mismo ─────────────────────────────────────────────
-- Si alguien con la contraseña consiguiera cambiar el correo de la cuenta, el
-- código iría a su buzón. Y quien cambia el correo porque el antiguo no es
-- seguro espera que eso cierre lo que se abrió con él. Pase lo que pase con la configuración de GoTrue, el
-- correo nuevo no vale de segundo paso hasta pasar la app.
create or replace function public.bloquear_correo_doble_factor_al_cambiar_correo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Los navegadores recordados también: uno pudo recordarse desde una sesión
  -- que pasó el correo antiguo (sus sesiones caen en cascada).
  delete from public.dispositivos_confianza where auth_user_id = new.id;
  delete from public.sesiones_confiadas where auth_user_id = new.id;
  delete from public.codigos_correo_doble_factor where auth_user_id = new.id;
  insert into public.doble_factor_correo_bloqueos (auth_user_id, desde, motivo)
  values (new.id, now(), 'correo')
  on conflict (auth_user_id) do update set desde = excluded.desde, motivo = excluded.motivo;
  return new;
end;
$$;

revoke all on function public.bloquear_correo_doble_factor_al_cambiar_correo() from public, anon;
revoke all on function public.bloquear_correo_doble_factor_al_cambiar_correo() from authenticated;

drop trigger if exists trg_bloquear_correo_doble_factor on auth.users;
create trigger trg_bloquear_correo_doble_factor
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.bloquear_correo_doble_factor_al_cambiar_correo();

-- ── Quitar el factor: también las sesiones confiadas por correo ────────────
-- Sin esto, una sesión confiada por correo «revivía» al activar otro factor
-- (la regla solo exige que haya alguno verificado).
create or replace function public.olvidar_dispositivos_al_quitar_factor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dispositivos_confianza where auth_user_id = old.user_id;
  delete from public.sesiones_confiadas where auth_user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.olvidar_dispositivos_al_quitar_factor() from public, anon;
revoke all on function public.olvidar_dispositivos_al_quitar_factor() from authenticated;

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.sesion_confiada_de(uuid, uuid)',
    'public.correo_doble_factor_disponible(uuid, uuid)',
    'public.intento_codigo_correo(uuid, uuid, int)',
    'public.confirmar_codigo_correo(uuid, uuid, text)'
  ] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% solo la puede llamar el servidor', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'service_role no puede ejecutar %', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.bloquear_correo_doble_factor_al_cambiar_correo()', 'EXECUTE') then
    raise exception 'authenticated puede ejecutar el trigger de cambio de correo';
  end if;
  if has_table_privilege('authenticated', 'public.codigos_correo_doble_factor', 'SELECT')
     or has_table_privilege('anon', 'public.codigos_correo_doble_factor', 'SELECT')
     or has_table_privilege('authenticated', 'public.doble_factor_correo_bloqueos', 'SELECT')
     or has_table_privilege('anon', 'public.doble_factor_correo_bloqueos', 'SELECT') then
    raise exception 'las tablas del segundo paso por correo son solo del servidor';
  end if;
end $$;
