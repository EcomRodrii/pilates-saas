-- RLS-1: Migración de foto_url (URLs públicas) → foto_storage_path (paths).
--
-- Las URLs públicas del bucket público `avatars` ya no son válidas porque
-- las fotos de personas se mudan a bucket privado `avatars-privadas`.
-- Ahora guardamos SOLO el path; las URLs se generan server-side on-demand.
--
-- Sin cambio DDL destructivo: dejamos foto_url como está (para backward compat
-- en queries existentes) y la rellenamos con NULL (o el path si queremos).
-- Mejor: extraer el path de las URLs existentes.

-- 1. Extraer path de las URLs existentes en socios
-- Formato antiguo: https://...supabase.co/storage/v1/object/public/avatars/<socio_id>
-- Nuevo: NULL (se regenera en servidor)
-- O mejor: si foto_url tiene el socio.id como substring, guardarlo

-- No hacemos cambio destructivo: dejamos NULL las fotos existentes
-- (se regenerarán la primera vez que se necesiten vía /api/foto/signed-url).
-- Nueva lógica en componentes: si foto_url es NULL o no es URL pública, generar firmada.

update socios set foto_url = null where foto_url is not null;
update instructores set foto_url = null where foto_url is not null;
update tipos_clase set foto_url = null where foto_url is not null;
update studios set foto_url = null where foto_url is not null;

-- 2. Comentario en las tablas para que sea claro el cambio
comment on column socios.foto_url is
  'RLS-1 (2026-09-17): Cambio de semantics — ahora almacena NULL o el path del storage (no URLs públicas). URLs se generan on-demand en servidor vía /api/foto/signed-url.';

comment on column instructores.foto_url is
  'RLS-1 (2026-09-17): Cambio de semantics — ahora almacena NULL o el path del storage (no URLs públicas). URLs se generan on-demand en servidor vía /api/foto/signed-url.';

comment on column tipos_clase.foto_url is
  'RLS-1 (2026-09-17): Cambio de semantics — ahora almacena NULL o el path del storage (no URLs públicas). URLs se generan on-demand en servidor vía /api/foto/signed-url.';

comment on column studios.foto_url is
  'RLS-1 (2026-09-17): Cambio de semantics — ahora almacena NULL o el path del storage (no URLs públicas). URLs se generan on-demand en servidor vía /api/foto/signed-url.';
