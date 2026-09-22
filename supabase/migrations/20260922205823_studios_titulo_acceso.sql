-- TENTARE — el titular de la pantalla de ENTRADA de la app de la alumna.
--
-- Hasta hoy decía «Muévete. Lo demás, ya está.» para todos los estudios: una
-- frase escrita por nosotros, fija, en la primera pantalla de una app de marca
-- blanca. Petición del fundador (22-sep-2026): que el estudio pueda ponerla.
--
-- NULL = se pinta la del producto, NO un hueco — mismo criterio que
-- `subtitulo_heroe` (migr 20260911000542) y por el mismo motivo: ese sitio YA
-- tiene texto hoy, así que activar la columna no puede dejar la entrada muda.
--
-- Los saltos de línea cuentan: la frase se pinta en tres renglones. Se guarda
-- tal cual y el límite es corto porque compite con la foto.
--
-- ⚠️ El GRANT: `authenticated` no tiene UPDATE sobre `studios` entera sino
-- lista blanca de columnas (migr 20260910171150), y una columna nueva no entra
-- sola — verificado con `has_column_privilege` después de aplicar (true para
-- `authenticated`, false para `anon`).

alter table public.studios
  add column if not exists titulo_acceso text;

alter table public.studios
  drop constraint if exists studios_titulo_acceso_longitud;
alter table public.studios
  add constraint studios_titulo_acceso_longitud
  check (titulo_acceso is null or length(titulo_acceso) <= 120);

comment on column public.studios.titulo_acceso is
  'Titular de la pantalla de entrada de la app de la alumna. NULL = el del producto, no un hueco.';

grant update (titulo_acceso) on public.studios to authenticated;
