-- ═══════════════════════════════════════════════════════════════════════════
-- Cuántas clases por semana mantienen la racha.
--
-- Hasta ahora era «al menos una», fijo en el código. Eso no mide lo mismo en un
-- estudio que da clase una vez por semana que en uno que la da tres: en el
-- segundo, la racha se mantiene faltando dos de cada tres y deja de significar
-- nada — que es lo contrario de lo que una racha pretende hacer.
--
-- NULL = el estudio no lo ha decidido, y se usa 1: el comportamiento de
-- siempre. No se pone DEFAULT 1 a propósito, para poder distinguir «lo eligió»
-- de «nunca lo tocó» si algún día hace falta.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studios
  add column if not exists racha_clases_semana integer;

comment on column public.studios.racha_clases_semana is
  'Clases por semana que mantienen la racha de la alumna. NULL = 1 (lo de siempre).';
