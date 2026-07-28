-- Propietaria e instructora solo podían elegir un avatar predefinido (memoji
-- o ilustración): no existía subida de foto real para ninguna de las dos,
-- solo para la socia (studios/instructores no tenían columna para guardarla).
-- Se añade `foto_url`, análoga a `socios.foto_url`, en ambas tablas.

alter table public.studios add column foto_url text;
alter table public.instructores add column foto_url text;
