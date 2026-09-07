-- Cuotas que no son mensuales, y matrícula de alta.
--
-- Una propietaria de estudio de Pilates: «Mi tarifa de septiembre a diciembre
-- es trimestral, y cobro 30 € de matrícula a las nuevas. Tal cual está, no
-- puedo reproducir mi lista de precios.» Tenía razón: `tipo` solo distinguía
-- MENSUAL / BONO / PUNTUAL, y una cuota siempre era de un mes.
--
-- Dos columnas, las dos aditivas y con default que reproduce EXACTAMENTE el
-- comportamiento de hoy — ninguna fila existente cambia de significado.

-- ── periodicidad_meses ──────────────────────────────────────────────────────
-- Cada cuántos meses se cobra y se extiende una cuota. Solo tiene sentido con
-- `tipo = 'MENSUAL'`; en un BONO manda `validez_dias` y en un PUNTUAL no hay
-- ciclo que renovar.
--
-- Un NÚMERO DE MESES y no un enum ('MENSUAL'/'TRIMESTRAL'/'ANUAL'): quien lo
-- usa (`cicloInicialDe` y las dos mitades de la renovación) lo único que hace
-- es sumar meses a una fecha, así que el número es directamente utilizable y
-- semestral sale gratis. Con un enum habría que mantener un mapa a meses en
-- los tres sitios, que es justo como divergen las cosas en este repo.
--
-- El CHECK acota a lo que el producto ofrece hoy: cualquier otro valor sería
-- un ciclo que ninguna pantalla sabe nombrar.
alter table public.planes_tarifa
  add column if not exists periodicidad_meses smallint not null default 1;

alter table public.planes_tarifa
  drop constraint if exists planes_tarifa_periodicidad_valida;
alter table public.planes_tarifa
  add constraint planes_tarifa_periodicidad_valida
  check (periodicidad_meses in (1, 3, 6, 12));

comment on column public.planes_tarifa.periodicidad_meses is
  'Cada cuántos meses se cobra y se extiende una cuota (tipo MENSUAL). 1 = mensual (default, comportamiento de siempre), 3 = trimestral, 6 = semestral, 12 = anual. Se ignora en BONO y PUNTUAL.';

-- ── matricula ───────────────────────────────────────────────────────────────
-- Cuota de alta: se cobra UNA VEZ, la primera vez que una socia contrata un
-- plan en el estudio, y NUNCA en las renovaciones.
--
-- Columna aparte y no sumada al precio a propósito: el cron de renovaciones
-- (`lib/inngest/renovaciones.ts`) emite el recibo con `plan.precio` tal cual, así
-- que meter la matrícula ahí dentro la cobraría cada mes. Separada, es
-- imposible: la matrícula genera su propio recibo, con su propio concepto, y el
-- de renovación nunca la mira.
alter table public.planes_tarifa
  add column if not exists matricula numeric(10, 2) not null default 0;

alter table public.planes_tarifa
  drop constraint if exists planes_tarifa_matricula_no_negativa;
alter table public.planes_tarifa
  add constraint planes_tarifa_matricula_no_negativa
  check (matricula >= 0);

comment on column public.planes_tarifa.matricula is
  'Cuota de alta en euros, IVA incluido. Se cobra una sola vez, en el primer plan que contrata una socia, como recibo aparte. 0 = sin matrícula.';
