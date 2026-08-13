-- Tentare Network — reconstrucción marketplace público (brief del fundador).
-- Slug legible para URLs indexables (/network/instructoras/[slug]). Se
-- genera en TS al publicar (lib/network/slug.ts + PATCH /api/network/perfil/
-- estado), no en SQL — más fácil de testear y de leer que un trigger con
-- unaccent. Nullable + unique: nulls no chocan entre sí en Postgres, así que
-- un perfil en draft/hidden sin slug todavía no rompe la restricción.
alter table public.red_perfiles add column if not exists slug text unique;
