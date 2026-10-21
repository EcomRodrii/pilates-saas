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

-- `authenticated` escribe `studios` por lista blanca de columnas (migr 20260910171150).
grant update (cobro_proporcional_alta_activo) on public.studios to authenticated;
