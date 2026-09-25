-- TENTARE — género de cada clienta/cliente, para que el panel hable bien de ella o de él.
--
-- Petición del fundador (25-sep-2026): poder indicar si una persona es mujer u
-- hombre y que con eso cambien las palabras («clienta fija» / «cliente fijo»,
-- «alumna» / «alumno»). Es un dato GRAMATICAL, no un perfil: solo se usa para
-- decidir el género de las palabras que hablan de esa persona.
--
-- NULL = sin indicar, y se sigue hablando en femenino como hasta ahora. No hay
-- default a propósito: rellenar 'MUJER' en todas las filas escribiría un dato que
-- nadie ha dado, y un estudio con un cliente varón lo vería mal etiquetado sin
-- que nadie lo hubiera elegido.
--
-- ⚠️ El GRANT: `authenticated` no tiene INSERT ni UPDATE sobre `socios` entera
-- sino por lista de columnas (24 de 47), y una columna nueva no entra sola —
-- sin él, guardar «Hombre» en el panel fallaría en silencio. Verificado con
-- `has_column_privilege` después de aplicar (true para `authenticated`, false
-- para `anon`).

alter table public.socios
  add column if not exists genero text;

alter table public.socios
  drop constraint if exists socios_genero_valido;
alter table public.socios
  add constraint socios_genero_valido
  check (genero is null or genero in ('MUJER', 'HOMBRE'));

comment on column public.socios.genero is
  'MUJER | HOMBRE | NULL (sin indicar). Solo decide el género gramatical de las palabras que hablan de esta persona en el panel; NULL = femenino, como siempre.';

grant insert (genero) on public.socios to authenticated;
grant update (genero) on public.socios to authenticated;
