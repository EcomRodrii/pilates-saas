-- TENTARE — interruptor «Preguntar los datos extra en su app» (Alta de alumnas).
--
-- Un estudio creó sus preguntas en «Datos extra de la ficha» y, probando como
-- alumna, no le salían en ningún momento: solo existían en el panel. Con esto
-- encendido, la alumna las contesta en su app antes de poder reservar o comprar.
--
-- APAGADO por defecto (decisión del fundador): encenderlo cambia lo que ven las
-- alumnas del estudio, así que lo decide el estudio.
--
-- ⚠️ `authenticated` no tiene UPDATE de tabla sobre `studios`, solo por columnas
-- (migr 20260910171150): sin este grant el interruptor fallaría al guardarse.

alter table public.studios
  add column if not exists preguntas_alta_activas boolean not null default false;

comment on column public.studios.preguntas_alta_activas is
  'Si true, la alumna contesta en su app las preguntas de «Datos extra de la ficha» (campos_personalizados activos) antes de poder usarla. Apagado por defecto.';

grant update (preguntas_alta_activas) on public.studios to authenticated;
