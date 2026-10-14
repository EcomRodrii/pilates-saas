-- Founding Studio gratis (decisión del fundador, 15-oct-2026; reglas en
-- lib/billing/plan-gratis.ts): lo que usa cada estudio gratis, medido por el
-- servidor (lib/billing/uso-gratis-servidor.ts) para saber si ha pasado de 150
-- alumnas activas o de 30 cobros en 30 días, y desde cuándo (los 30 días de
-- margen).
--
-- Solo la escribe y la lee el servidor (service_role): si la dueña pudiera
-- escribir `excedido_desde`, se reiniciaría el margen a mano. El navegador lo ve
-- por /api/billing/status, ya derivado.

create table if not exists public.uso_plan_gratis (
  studio_id text primary key references public.studios(id) on delete cascade,
  -- null = todavía sin medir (la fila se crea al reservar la primera medición).
  alumnas_activas integer check (alumnas_activas >= 0),
  cobros_30_dias integer check (cobros_30_dias >= 0),
  -- El día (Madrid) en que el grupo de la dueña pasó un límite; null si está dentro.
  excedido_desde date,
  medido_en timestamptz,
  -- La medición en curso (una a la vez; se reintenta pasados unos minutos).
  intento_en timestamptz,
  creado_en timestamptz not null default now()
);

comment on table public.uso_plan_gratis is
  'Uso del plan gratis (Founding Studio) por estudio: alumnas activas, cobros en 30 días y desde cuándo pasó un límite. Solo servidor (lib/billing/uso-gratis-servidor.ts).';

alter table public.uso_plan_gratis enable row level security;

-- Verificación en dos pasos del equipo (tentare-os): restrictiva en cada tabla nueva.
create policy exige_doble_factor on public.uso_plan_gratis as restrictive for all to authenticated
  using ((select public.nivel_acceso_suficiente())) with check ((select public.nivel_acceso_suficiente()));

-- Sin lectura ni escritura desde el navegador: ninguna política permisiva.
revoke all on public.uso_plan_gratis from anon, authenticated;
grant all on public.uso_plan_gratis to service_role;
