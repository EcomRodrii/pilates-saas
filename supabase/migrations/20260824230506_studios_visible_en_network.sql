-- Tentare Network F3 — opt-in de estudio en el directorio de Network.
-- Apagado por defecto: un directorio de búsqueda activa expone al estudio a
-- gente que no lo conocía todavía, distinto de /reservar/[slug] (público sin
-- pedir nada porque solo lo encuentra quien ya sabe del estudio).
-- Sin RLS nueva: la columna hereda las políticas ya existentes de `studios`.
-- La UI que active este toggle la construye otro agente después.
alter table public.studios
  add column visible_en_network boolean not null default false;
