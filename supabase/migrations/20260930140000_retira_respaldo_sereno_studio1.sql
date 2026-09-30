-- Retira `respaldo_sereno_studio1`: una copia puntual del editor de tema (una
-- fila, de agosto) de un estudio que ya no existe. Sin `studio_id`, sin nadie
-- que la lea y sin nada que dependa de ella (ni FK, ni vistas, ni funciones).
-- Solo la creó a mano una sesión; ninguna migración la crea, y por eso CI se
-- salta 20260819211544 (el paso `rm` de .github/workflows/ci.yml).
--
-- ⚠️ Borra datos: en producción NO la aplica una sesión, la ejecuta el fundador
-- (y la registra en schema_migrations con esta misma versión). En una base de
-- datos nueva no hace nada.
drop table if exists public.respaldo_sereno_studio1;
