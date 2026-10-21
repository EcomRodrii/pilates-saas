-- Cobro proporcional al alta de una cuota mensual (petición real de un estudio,
-- 2026-10-21): «si una clienta nueva se apunta a mitad de mes, cobrarle la parte
-- proporcional y que el mes siguiente pague completo».
--
-- Apagado de serie: ningún estudio cambia de comportamiento sin activarlo.
-- Con esto activo, una cuota MENSUAL (un mes) dada de alta POR EL PANEL cobra la
-- parte del mes en curso y su primer ciclo acaba el último día del mes (ver
-- lib/billing/prorrateo.ts). La renovación la hace el cron de siempre el día 1,
-- por la cuota entera, y SOLO realinea al día 1 las cuotas que ya nacieron
-- alineadas: ninguna suscripción existente se toca.
--
-- Aditiva y sin datos que migrar. Se aplica ANTES de desplegar el código (el
-- código lee la columna con `?? false`, pero su interruptor la escribe).
alter table public.studios
  add column if not exists cobro_proporcional_alta_activo boolean not null default false;

-- Días mínimos restantes para prorratear (por estudio, en el MISMO sitio que el
-- ajuste). Si al alta quedan este número de días o menos (contando el del alta),
-- no se cobra una cantidad simbólica: la primera cuota se cobra el día 1 del mes
-- siguiente. 0 = prorratear siempre. Tope 10: un mínimo >= días del mes anularía
-- el prorrateo entero. Default 3 (decisión del fundador, 21-oct-2026); no
-- enciende nada por sí solo: el ajuste de arriba sigue apagado.
alter table public.studios
  add column if not exists cobro_proporcional_dias_minimos integer not null default 3;
alter table public.studios drop constraint if exists studios_cobro_proporcional_dias_minimos_check;
alter table public.studios add constraint studios_cobro_proporcional_dias_minimos_check
  check (cobro_proporcional_dias_minimos between 0 and 10);

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150).
grant update (cobro_proporcional_alta_activo, cobro_proporcional_dias_minimos) on public.studios to authenticated;
