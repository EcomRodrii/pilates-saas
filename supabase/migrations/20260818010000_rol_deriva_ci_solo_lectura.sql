-- Rol de solo lectura para el check de deriva de migraciones (CI).
--
-- POR QUÉ EXISTE. `scripts/comprobar-deriva-migraciones.mjs` necesita leer UNA
-- tabla de producción: `supabase_migrations.schema_migrations`. La primera
-- versión lo hacía con la Management API, que exige un `SUPABASE_ACCESS_TOKEN`
-- — un token con control TOTAL del proyecto (crear/borrar ramas, aplicar
-- migraciones, leer cualquier tabla), viviendo en la CI de un repo público.
-- Muchísimo alcance para leer una lista de nombres.
--
-- Este rol puede exactamente eso y nada más. Si la credencial se filtra, lo que
-- se lleva el atacante es el catálogo de nombres de migraciones — que además ya
-- está en el repo, que es público.
--
-- `noinherit` y sin pertenencia a ningún otro rol: no hereda privilegios de
-- nadie. No se le concede nada sobre `public`, `auth`, `storage` ni ninguna otra
-- tabla.
--
-- ⚠️ LA CONTRASEÑA NO VA AQUÍ, a propósito. Se pone aparte (`alter role ...
-- password ...`) para que no acabe en el repo ni en el historial de git. Sin
-- contraseña el rol NO puede autenticarse: falla en cerrado.
create role deriva_ci with login noinherit;

grant usage on schema supabase_migrations to deriva_ci;
grant select on supabase_migrations.schema_migrations to deriva_ci;
