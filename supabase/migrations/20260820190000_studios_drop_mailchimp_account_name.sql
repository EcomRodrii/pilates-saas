-- ⚠️ FICHERO RECUPERADO DE PRODUCCIÓN (2026-08-21), no escrito de nuevo.
--
-- Deshace 20260820180000: la columna se añadió y se quitó el mismo día. Efecto
-- neto del par: ninguno — verificado en vivo, `studios.mailchimp_account_name`
-- NO existe hoy en producción.
--
-- SQL copiado literal de `supabase_migrations.schema_migrations.statements`.
-- Aplicada en producción bajo la versión 20260820195503.

alter table public.studios
  drop column if exists mailchimp_account_name;
