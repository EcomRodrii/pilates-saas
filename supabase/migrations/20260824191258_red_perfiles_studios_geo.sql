-- Tentare Network 2.0, Fase 0 (esquema). Lat/lng para búsqueda por
-- proximidad de perfiles de red publicados, y para studios en general
-- (sin caso de uso todavía, se prepara la columna sin índice geográfico).
-- Nullable en ambos casos: no todo perfil/estudio tendrá geocodificación.
-- Sin RLS nueva: ambas tablas ya tienen sus políticas y las columnas
-- nuevas las heredan sin distinción por columna.

alter table public.red_perfiles
  add column lat double precision,
  add column lng double precision;

create index idx_red_perfiles_geo_published
  on public.red_perfiles (lat, lng)
  where estado = 'published' and lat is not null;

alter table public.studios
  add column lat double precision,
  add column lng double precision;
