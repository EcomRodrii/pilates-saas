-- ⚠️ Fichero RECUPERADO, no escrito a mano: esta migración se aplicó en
-- producción con `apply_migration` (versión real 20260922001832) y nunca
-- tuvo fichero en el repo — el check de «Deriva de migraciones» la detectó
-- huérfana el 22-sep. El texto de abajo es literal el de
-- `supabase_migrations.schema_migrations.statements`.

alter table public.opening_config add column if not exists avisar_abrimos boolean not null default false;
