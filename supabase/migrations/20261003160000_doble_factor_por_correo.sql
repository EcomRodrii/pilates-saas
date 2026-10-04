-- ═══════════════════════════════════════════════════════════════════════════
-- El segundo paso por CORREO (3-oct-2026, decisión del fundador): al entrar al
-- panel con la verificación en dos pasos activada, lo primero es un código de
-- un solo uso enviado al correo de la cuenta; la app de autenticación queda
-- para «No tengo acceso a mi correo». Reglas en lib/auth/codigo-correo-reglas.ts.
--
-- Cómo encaja con 20261003110108_dispositivos_de_confianza.sql: Supabase no
-- tiene el correo como factor, así que verificar el código NO sube la sesión a
-- `aal2`. El servidor la apunta en `sesiones_confiadas` con origen 'correo', y
-- la regla única `sesion_confiada_de` la acepta. Ni una política cambia:
-- `nivel_acceso_suficiente()`, `current_studio_id()` y `verificarSesionStaff`
-- ya preguntan a esa función.
--
-- Una sesión confiada por correo vale lo que viva la sesión de Supabase (como
-- una `aal2`): se va con ella (cascada con auth.sessions), con el factor, y al
-- cambiar la contraseña o el correo.
--
-- Cuándo el correo NO vale de segundo paso (la regla vive aquí, en
-- `correo_doble_factor_disponible`, no en TypeScript):
--   · La sesión no entró con contraseña (`auth.mfa_amr_claims`, el mismo dato
--     del que sale el claim `amr`): con Google o con un enlace/código por
--     correo, el correo sería el mismo factor dos veces.
--   · Cambió la contraseña o el correo de la cuenta y desde entonces no ha
--     pasado la app de autenticación: con el buzón se restablece la contraseña,
--     y el código llegaría a ese mismo buzón. Regla de negocio, no de reloj: la
--     marca dura hasta un `aal2` de verdad, no 24 horas.
--
-- Lo que el correo no da, a propósito: activar la verificación (hace falta un
-- factor de Supabase), quitar o añadir factores ni apagar «exigir a todo el
-- equipo» (GoTrue / `aal2`), ni la zona interna (/interno, su propio `aal2`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sesiones_confiadas: también por correo ─────────────────────────────────
alter table public.sesiones_confiadas
  add column if not exists origen text not null default 'dispositivo';
alter table public.sesiones_confiadas alter column dispositivo_id drop not null;
alter table public.sesiones_confiadas drop constraint if exists sesiones_confiadas_origen_valido;
alter table public.sesiones_confiadas add constraint sesiones_confiadas_origen_valido
  check (origen in ('dispositivo', 'correo') and (origen = 'dispositivo') = (dispositivo_id is not null));
-- La FK compuesta (dispositivo_id, auth_user_id) es MATCH SIMPLE: con
-- dispositivo_id nulo no se comprueba, que es lo que se quiere para 'correo'.

comment on column public.sesiones_confiadas.origen is
  '''dispositivo'': confiada al presentar un navegador recordado (vale mientras no caduque). ''correo'': pasó el código enviado al correo (vale lo que viva la sesión).';

-- ── Los códigos ─────────────────────────────────────────────────────────────
create table if not exists public.codigos_correo_doble_factor (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  codigo_hash text not null,
  intentos int not null default 0 check (intentos >= 0),
  enviado_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  usado_en timestamptz
);
create index if not exists codigos_correo_doble_factor_usuario on public.codigos_correo_doble_factor (auth_user_id);

comment on table public.codigos_correo_doble_factor is
  'El código vivo del segundo paso por correo de cada sesión (uno por sesión: pedir otro lo sustituye). Solo servidor.';
comment on column public.codigos_correo_doble_factor.codigo_hash is
  'HMAC-SHA256 con un secreto del servidor sobre cuenta, sesión y código. El código nunca se guarda: sin el secreto, un volcado no lo saca por fuerza bruta.';

-- ── Cuentas a las que el correo no les vale hasta pasar la app ─────────────
create table if not exists public.doble_factor_correo_bloqueos (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  desde timestamptz not null default now(),
  motivo text not null check (motivo in ('contrasena', 'correo'))
);

comment on table public.doble_factor_correo_bloqueos is
  'Cuentas que cambiaron la contraseña o el correo y aún no han pasado la app de autenticación (aal2): hasta entonces el segundo paso no puede ser por correo. Solo servidor.';

alter table public.codigos_correo_doble_factor enable row level security;
alter table public.doble_factor_correo_bloqueos enable row level security;
revoke all on table public.codigos_correo_doble_factor from anon, authenticated;
revoke all on table public.doble_factor_correo_bloqueos from anon, authenticated;

-- La restrictiva de 20261003102845 en toda tabla de public con RLS (lo vigila
-- supabase/tests/rls-doble-factor.test.ts).
drop policy if exists exige_doble_factor on public.codigos_correo_doble_factor;
create policy exige_doble_factor on public.codigos_correo_doble_factor as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
drop policy if exists exige_doble_factor on public.doble_factor_correo_bloqueos;
create policy exige_doble_factor on public.doble_factor_correo_bloqueos as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── La regla única: ¿esta sesión la confió el servidor? ────────────────────
-- Misma firma que en 20261003110108 (conserva sus permisos; se comprueban
-- abajo). Ahora: un dispositivo vigente, o el código del correo.
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

-- ── ¿Puede esta sesión pasar el segundo paso por correo? ───────────────────
-- null = sí; si no, el motivo. La llaman el servidor antes de enviar y
-- `intento_codigo_correo` antes de contar un intento.
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
    -- Solo contraseña como primer paso (lista blanca: un método desconocido dice que no).
    when not exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method = 'password')
      or exists (select 1 from auth.mfa_amr_claims a where a.session_id = p_sesion and a.authentication_method not in ('password', 'totp'))
      then 'sin_contrasena'
    when exists (select 1 from public.doble_factor_correo_bloqueos b where b.auth_user_id = p_usuario)
      then 'bloqueado'
  end;
$$;

comment on function public.correo_doble_factor_disponible(uuid, uuid) is
  'null si esa sesión puede pasar el segundo paso con un código por correo; si no, el motivo. Solo servidor.';

-- ── Contar un intento ───────────────────────────────────────────────────────
-- Atómico (FOR UPDATE): dos peticiones a la vez no se saltan el tope. Devuelve
-- el hash SOLO si el código está vivo y tras sumar el intento; la comparación
-- la hace el servidor en tiempo constante, y la confirma `confirmar_codigo_correo`.
-- ⚠️ `estado` y `codigo_hash` son columnas de salida: dentro, todo va con alias.
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

-- ── Confirmar: gastar el código y confiar la sesión, en una transacción ─────
-- Compare-and-set sobre el hash y `usado_en is null`: un código solo se gasta
-- una vez aunque lleguen dos peticiones con él. Si la sesión ya estaba
-- confiada por un dispositivo, pasa a 'correo' (vale lo que viva la sesión).
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
     -- Solo tras un intento contado por `intento_codigo_correo` (que es quien pone el tope).
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

-- Solo del servidor, con los tres pasos (ver tentare-os.md: el default ACL da
-- EXECUTE directo a anon/authenticated, revocar PUBLIC no basta).
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
