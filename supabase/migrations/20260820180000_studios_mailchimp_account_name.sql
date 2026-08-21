-- ⚠️ FICHERO RECUPERADO DE PRODUCCIÓN (2026-08-21), no escrito de nuevo.
--
-- Esta migración se aplicó sin dejar fichero en el repo, junto con la que la
-- deshace (20260820190000). El chequeo «Deriva de migraciones» las cazó en
-- `main` y tenía razón: aunque su efecto neto sea cero, reconstruir la BD desde
-- el repo habría dado un historial distinto del real.
--
-- El SQL es el que hay guardado en `supabase_migrations.schema_migrations`
-- (columna `statements`), copiado literal — no una reconstrucción a ojo.
-- Aplicada en producción bajo la versión 20260820185911.
--
-- Se conserva en vez de borrar el par: el historial de migraciones es un
-- registro de lo que pasó, no un estado final. Quien reconstruya desde cero
-- tiene que pasar por los mismos pasos, incluido este.

alter table public.studios
  add column if not exists mailchimp_account_name text;

comment on column public.studios.mailchimp_account_name is
  'Nombre de la cuenta de Mailchimp conectada (OAuth, BYO account), solo para pintar la card en Configuracion -> Integraciones. NULL = no conectado.';
