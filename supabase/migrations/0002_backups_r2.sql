-- ═══════════════════════════════════════════════════════════════════
-- 0002 · backups fuera de Postgres → Cloudflare R2 (P0-13/14)
-- ═══════════════════════════════════════════════════════════════════
-- Hasta ahora el snapshot entero vivía en backups.datos (jsonb NOT NULL):
-- guardar el respaldo dentro de la misma BD que respalda. A partir de aquí el
-- snapshot va a R2 y en la tabla queda solo metadata + la clave del objeto.
--
-- Retrocompatible: 'datos' pasa a nullable pero se conserva (los backups
-- antiguos siguen teniendo su snapshot inline y se restauran igual). Los nuevos
-- backups guardan 'storage_key' y dejan 'datos' NULL. El restore usa
-- storage_key si existe, y cae a datos si no.
-- ═══════════════════════════════════════════════════════════════════

alter table backups alter column datos drop not null;
alter table backups add column if not exists storage_key text;
