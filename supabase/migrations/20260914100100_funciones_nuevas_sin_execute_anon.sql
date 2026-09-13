-- Funciones nuevas de `public` sin EXECUTE para `anon` por defecto.
--
-- Auditoría RGPD/seguridad 2026-09-13, A26 / control C11.
--
-- `pg_default_acl` daba EXECUTE a `anon` (y, por el default global, a PUBLIC)
-- en toda función que `postgres` creara en `public`, incluida cada firma nueva
-- de una función existente. Por eso cada migración tenía que acordarse de su
-- REVOKE, y la guía del repo lo recordaba en varios sitios.
--
-- Quién crea funciones en `public` (`pg_default_acl.defaclrole` en prod):
--  · `postgres`: todas las migraciones (apply_migration y el editor SQL corren
--    como `postgres`, medido). Es el default que se cambia aquí.
--  · `supabase_admin`: solo la plataforma (extensiones). Su default no se puede
--    cambiar desde `postgres` (42501, ensayado): no instalar extensiones en
--    `public`.
--
-- Qué recibe una función nueva creada por `postgres` en `public`: postgres
-- (dueña), authenticated y service_role. `authenticated` se mantiene a
-- propósito: lo necesitan los helpers de RLS y las RPC del panel, y quitarlo
-- dejaría sin ejecutar las funciones que otras ramas ya tienen en curso. Aun
-- así, cada función SECURITY DEFINER nueva declara su decisión sobre anon con
-- un REVOKE o un GRANT explícito; lo vigila
-- lib/rgpd-grants-anon-guardias-contrato.test.ts.
--
-- El default de PUBLIC se revoca SIN «in schema»: Postgres no deja restar por
-- esquema lo que concede el default global. Todas las funciones de este repo
-- se crean en `public`, así que no afecta a otros esquemas propios.
--
-- ⚠️ No toca ninguna función existente. Las que hoy ejecuta anon se revisaron
-- una a una en la auditoría (RPC públicas, helpers de RLS, triggers): si alguna
-- sobra, se revoca con nombre propio, no desde aquí.
--
-- Fuera de alcance, verificado: los privilegios del esquema `net` (pg_net) los
-- fija la extensión, propiedad de `supabase_admin`; un REVOKE desde `postgres`
-- no tiene efecto (ensayado). Se gestiona con el proveedor.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres
  revoke execute on functions from public;

do $verificacion$
declare
  v_global text;
  v_public text;
begin
  select d.defaclacl::text into v_global
    from pg_default_acl d
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f';
  select d.defaclacl::text into v_public
    from pg_default_acl d
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f';

  if v_global is null or v_global ~ '[{,]=X' then
    raise exception 'el default global de funciones de postgres sigue concediendo EXECUTE a PUBLIC: %', v_global;
  end if;
  if coalesce(v_public, '') ~ '[{,]anon=X' then
    raise exception 'el default de funciones de postgres en public sigue concediendo EXECUTE a anon: %', v_public;
  end if;
end
$verificacion$;
