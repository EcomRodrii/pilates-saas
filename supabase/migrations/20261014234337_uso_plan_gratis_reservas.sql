-- Founding Studio gratis (lib/billing/plan-gratis.ts): el segundo límite deja de
-- ser «30 cobros al mes» y pasa a ser 250 RESERVAS al mes (decisión del
-- fundador, 15-oct-2026 ~02:15): los cobros se esquivan cobrando fuera de
-- Tentare; las reservas no. Columna aditiva; `cobros_30_dias` se queda sin uso
-- (la tabla estaba vacía: el interruptor FOUNDING_GRATIS sigue apagado).
alter table public.uso_plan_gratis add column if not exists reservas_30_dias integer check (reservas_30_dias >= 0);

comment on column public.uso_plan_gratis.reservas_30_dias is
  'Reservas de las clases de los últimos 30 días (sin canceladas, lista de espera ni pendientes de aprobar), por la fecha de la clase. El segundo límite del plan gratis desde el 15-oct-2026 (antes, cobros).';
