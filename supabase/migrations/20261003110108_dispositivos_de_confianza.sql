-- ═══════════════════════════════════════════════════════════════════════════
-- «No volver a pedir el código en este dispositivo» (3-oct-2026, decisión del
-- fundador): quien tiene la verificación en dos pasos activada puede marcar el
-- navegador en el que acaba de escribir el código, y durante 30 días desde la
-- última vez que lo use no se le vuelve a pedir al entrar. Reglas en
-- lib/auth/dispositivo-confianza-reglas.ts.
--
-- Cómo encaja con 20261003020400_doble_factor_equipo.sql: allí la base de
-- datos solo deja pasar una sesión `aal2`. Supabase no sabe subir de nivel una
-- sesión por un dispositivo recordado, así que la sesión sigue en `aal1` y lo
-- que cambia es la pregunta: «¿esta sesión ha pasado el segundo paso?» ahora
-- es «`aal2`, o es una sesión que el servidor confió por un dispositivo
-- recordado» (`sesion_de_confianza()`). La responden igual la base de datos
-- (aquí) y `verificarSesionStaff` (lib/auth-server.ts).
--
--   · `dispositivos_confianza`: un navegador recordado. Del token que guarda la
--     cookie (HttpOnly) solo se guarda el hash: con una copia de la tabla no se
--     entra en ningún sitio. Nombre, IP y fechas son para que la persona vea
--     desde dónde se entra y pueda quitarlo.
--   · `sesiones_confiadas`: qué sesiones de Supabase (`session_id` del JWT)
--     confió el servidor al presentar ese dispositivo. Quitar el dispositivo
--     borra sus sesiones en cascada: esas sesiones vuelven a necesitar el código.
--     Cerrar la sesión (Supabase borra su fila de auth.sessions) también.
--
-- Una sesión confiada deja de valer si su dispositivo caduca (30 días sin
-- usarse; el panel lo alarga en cada carga), si se quita, si la persona ya no
-- tiene la verificación activada, si quita su factor (trigger) o si cambia la
-- contraseña (trigger). Solo los escribe y lee el servidor (service_role).
--
-- ⚠️ La zona interna (/interno) NO acepta esto: tiene su propia comprobación de
-- `aal2` sobre el token (lib/interno/mfa.ts) y sigue pidiendo el código.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.dispositivos_confianza (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  nombre text not null,
  ip_ultima text,
  creado_en timestamptz not null default now(),
  ultimo_uso_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  -- Para la FK compuesta de sesiones_confiadas: la sesión y el dispositivo son
  -- de la misma cuenta, lo garantiza la base de datos.
  unique (id, auth_user_id)
);
create index if not exists dispositivos_confianza_usuario on public.dispositivos_confianza (auth_user_id);

comment on table public.dispositivos_confianza is
  'Navegadores en los que la persona pidió no volver a escribir el código de la verificación en dos pasos. Solo servidor.';
comment on column public.dispositivos_confianza.token_hash is
  'sha256 del token de la cookie. El token nunca se guarda.';
comment on column public.dispositivos_confianza.ip_ultima is
  'La IP desde la que se usó por última vez. Solo para enseñarla en la lista de la persona.';
comment on column public.dispositivos_confianza.caduca_en is
  'Hasta cuándo vale para entrar sin código. Se alarga 30 días cada vez que se usa.';

create table if not exists public.sesiones_confiadas (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  dispositivo_id uuid not null,
  creada_en timestamptz not null default now(),
  foreign key (dispositivo_id, auth_user_id)
    references public.dispositivos_confianza (id, auth_user_id) on delete cascade
);
-- Para el borrado en cascada al quitar un dispositivo (la FK compuesta).
create index if not exists sesiones_confiadas_dispositivo on public.sesiones_confiadas (dispositivo_id, auth_user_id);

comment on table public.sesiones_confiadas is
  'Sesiones de Supabase (session_id del JWT) que cuentan como verificadas por venir de un dispositivo de confianza. Solo servidor.';

-- Nadie del navegador: ni lee ni escribe. El servidor usa service_role.
alter table public.dispositivos_confianza enable row level security;
alter table public.sesiones_confiadas enable row level security;
revoke all on table public.dispositivos_confianza from anon, authenticated;
revoke all on table public.sesiones_confiadas from anon, authenticated;

-- Toda tabla de public con RLS lleva la restrictiva de 20261003020400 (lo vigila
-- supabase/tests/rls-doble-factor.test.ts). Aquí no da nada que no den ya los
-- permisos, pero la regla es para todas.
drop policy if exists exige_doble_factor on public.dispositivos_confianza;
create policy exige_doble_factor on public.dispositivos_confianza as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));
drop policy if exists exige_doble_factor on public.sesiones_confiadas;
create policy exige_doble_factor on public.sesiones_confiadas as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- ── ¿Esta sesión la confió el servidor? ─────────────────────────────────────
-- La regla vive UNA vez, en `sesion_confiada_de`: la usan la base de datos (por
-- `sesion_de_confianza()`, con la sesión del JWT) y el servidor (por RPC, en
-- `verificarSesionStaff`), así que no pueden decir cosas distintas. Cuenta si:
-- el servidor apuntó esa sesión para esa cuenta, su dispositivo no ha caducado
-- y la persona sigue teniendo la verificación activada.
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
         join public.dispositivos_confianza d on d.id = s.dispositivo_id and d.auth_user_id = s.auth_user_id
        where s.session_id = p_sesion and s.auth_user_id = p_usuario and d.caduca_en > now()
     )
     and exists (
       select 1 from auth.mfa_factors f where f.user_id = p_usuario and f.status = 'verified'
     );
$$;

comment on function public.sesion_confiada_de(uuid, uuid) is
  'true si esa sesión de esa cuenta cuenta como verificada por un dispositivo recordado. Solo servidor.';

revoke execute on function public.sesion_confiada_de(uuid, uuid) from public;
revoke execute on function public.sesion_confiada_de(uuid, uuid) from anon;
revoke execute on function public.sesion_confiada_de(uuid, uuid) from authenticated;
grant execute on function public.sesion_confiada_de(uuid, uuid) to service_role;

-- La de la sesión que consulta. SECURITY DEFINER (dueño postgres, que no pasa
-- por la RLS de estas tablas): la llaman `nivel_acceso_suficiente()` y
-- `current_studio_id()`, también SECURITY DEFINER, así que nadie más necesita
-- ejecutarla. ⚠️ No la llames desde una política ni desde una función SECURITY
-- INVOKER: `authenticated` no puede ejecutarla y tumbaría la tabla entera. Usa
-- `nivel_acceso_suficiente()`. El `session_id` lo firma Supabase dentro del
-- JWT; el filtro de formato solo evita que un valor raro haga fallar el cast.
create or replace function public.sesion_de_confianza()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sesion_confiada_de(
    auth.uid(),
    case
      when (auth.jwt() ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then (auth.jwt() ->> 'session_id')::uuid
    end
  );
$$;

comment on function public.sesion_de_confianza() is
  'true si la sesión del JWT la confió el servidor por un dispositivo recordado (cuenta como la verificación en dos pasos).';

revoke execute on function public.sesion_de_confianza() from public;
revoke execute on function public.sesion_de_confianza() from anon;
revoke execute on function public.sesion_de_confianza() from authenticated;
grant execute on function public.sesion_de_confianza() to service_role;

-- ── nivel_acceso_suficiente(): `aal2` o sesión de confianza ─────────────────
create or replace function public.nivel_acceso_suficiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Sin usuario no hay factor que buscar (`user_id = null` no casa nada): la
  -- regla no aplica y deciden las demás políticas, que sin estudio no dan nada.
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
      or public.sesion_de_confianza();
$$;

revoke execute on function public.nivel_acceso_suficiente() from public;
revoke execute on function public.nivel_acceso_suficiente() from anon;
grant execute on function public.nivel_acceso_suficiente() to authenticated, service_role;

-- ── current_studio_id(): lo mismo ───────────────────────────────────────────
-- Copia de la de 20261003020400 con un solo cambio (la primera rama del CASE).
-- Se comprueba antes que la vigente es ESA.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.current_studio_id()'::regprocedure)
     <> '8d2ea2242c0b96ddfafbd1734230ba41' then
    raise exception 'current_studio_id ha cambiado: rehaz esta copia sobre la vigente';
  end if;
end $$;

create or replace function public.current_studio_id()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
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
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then null
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
$function$;

revoke execute on function public.current_studio_id() from anon, public;
grant  execute on function public.current_studio_id() to authenticated, service_role;

-- ── Cambiar la contraseña olvida los dispositivos ───────────────────────────
-- Quien cambia la contraseña porque cree que se la han robado espera que eso
-- cierre también las puertas que dejó abiertas. Mismo patrón que
-- trg_altas_estudio_registrar_cuenta (20261001195938).
create or replace function public.olvidar_dispositivos_al_cambiar_contrasena()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dispositivos_confianza where auth_user_id = new.id;
  return new;
end;
$$;

revoke execute on function public.olvidar_dispositivos_al_cambiar_contrasena() from public;
revoke execute on function public.olvidar_dispositivos_al_cambiar_contrasena() from anon;
revoke execute on function public.olvidar_dispositivos_al_cambiar_contrasena() from authenticated;

drop trigger if exists trg_olvidar_dispositivos_contrasena on auth.users;
create trigger trg_olvidar_dispositivos_contrasena
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password)
  execute function public.olvidar_dispositivos_al_cambiar_contrasena();

-- ── Quitar el factor (o rehacerlo) olvida los dispositivos ──────────────────
-- Quien rehace la verificación porque cree que se la han robado tampoco puede
-- dejar vivos los navegadores que se recordaron con la anterior. Solo al quitar
-- uno VERIFICADO: al activarla se borran a veces intentos sin terminar, y eso
-- no debe tocar nada.
create or replace function public.olvidar_dispositivos_al_quitar_factor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dispositivos_confianza where auth_user_id = old.user_id;
  return old;
end;
$$;

revoke execute on function public.olvidar_dispositivos_al_quitar_factor() from public;
revoke execute on function public.olvidar_dispositivos_al_quitar_factor() from anon;
revoke execute on function public.olvidar_dispositivos_al_quitar_factor() from authenticated;

drop trigger if exists trg_olvidar_dispositivos_factor on auth.mfa_factors;
create trigger trg_olvidar_dispositivos_factor
  after delete on auth.mfa_factors
  for each row
  when (old.status = 'verified')
  execute function public.olvidar_dispositivos_al_quitar_factor();

-- ── Verificación ─────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.sesion_de_confianza()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sesion_de_confianza()', 'EXECUTE')
     or has_function_privilege('anon', 'public.sesion_confiada_de(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sesion_confiada_de(uuid, uuid)', 'EXECUTE') then
    raise exception 'la confianza de una sesión solo la pregunta el servidor';
  end if;
  if has_function_privilege('anon', 'public.nivel_acceso_suficiente()', 'EXECUTE') then
    raise exception 'anon puede ejecutar nivel_acceso_suficiente';
  end if;
  if has_function_privilege('authenticated', 'public.olvidar_dispositivos_al_cambiar_contrasena()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.olvidar_dispositivos_al_quitar_factor()', 'EXECUTE') then
    raise exception 'authenticated puede ejecutar un trigger de dispositivos de confianza';
  end if;
  if has_table_privilege('authenticated', 'public.dispositivos_confianza', 'SELECT')
     or has_table_privilege('authenticated', 'public.sesiones_confiadas', 'SELECT')
     or has_table_privilege('anon', 'public.dispositivos_confianza', 'SELECT')
     or has_table_privilege('anon', 'public.sesiones_confiadas', 'SELECT') then
    raise exception 'las tablas de dispositivos de confianza son solo del servidor';
  end if;
  if position('sesion_de_confianza' in pg_get_functiondef('public.current_studio_id()'::regprocedure)) = 0
     or position('sesion_de_confianza' in pg_get_functiondef('public.nivel_acceso_suficiente()'::regprocedure)) = 0 then
    raise exception 'current_studio_id y nivel_acceso_suficiente tienen que aceptar la sesión de confianza';
  end if;
end $$;
