-- Fila 11 del informe estratégico (P1, Impacto 4/Dificultad 3): "La nómina
-- de instructoras genera conflictos" → "Liquidación automática: base +
-- variable + subs + reparto de penalizaciones". El problema declarado es
-- FALTA DE TRANSPARENCIA en el cálculo, no ausencia de un sistema de pago —
-- construir un payout real (Stripe Connect a instructoras: KYC, cuentas
-- Express/Custom) sería una pieza de infraestructura de otro orden de
-- magnitud que nadie ha pedido. Esto genera y persiste un DESGLOSE
-- auditable (BORRADOR → CONFIRMADA → PAGADA), sin mover dinero real — mismo
-- criterio que "Cierre de año": prepara datos, no ejecuta el pago.

-- Base fija opcional (nullable = sin base, freelance pura por hora) y
-- recargo % por horas cubiertas como sustituta — ambas en la tabla que YA
-- separa el dato salarial de `instructores` (20260731110000), no una
-- columna nueva en esa tabla compartida.
alter table instructor_tarifas add column if not exists base_mensual_eur numeric(7,2);
alter table instructor_tarifas add column if not exists recargo_sustitucion_pct numeric(5,2);

comment on column instructor_tarifas.base_mensual_eur is
  'Parte fija mensual de la liquidación, en euros. NULL = sin base (solo variable por hora).';
comment on column instructor_tarifas.recargo_sustitucion_pct is
  'Recargo % sobre tarifa_hora para horas cubiertas como sustituta (motivación a aceptar subs). NULL/0 = sin recargo.';

-- Reparto de penalizaciones cobradas — política de estudio (compensación de
-- personal), no por tipo de clase.
alter table studios add column if not exists instructor_reparto_penalizacion_pct numeric(5,2);

comment on column studios.instructor_reparto_penalizacion_pct is
  'NULL/0 (default) = sin reparto. Si se fija, ese % del importe COBRADO de cada penalización se atribuye en la liquidación a la instructora de la sesión afectada.';

-- Documento de liquidación mensual persistido, con transición de estado
-- explícita — nunca se recalcula en silencio una liquidación ya CONFIRMADA
-- (la instructora ya la vio; cambiar el número sin más rompe la confianza
-- que esta feature existe para dar).
create table if not exists public.liquidaciones_instructoras (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  instructor_id text not null references public.instructores(id) on delete cascade,
  periodo_anio integer not null,
  periodo_mes integer not null check (periodo_mes between 1 and 12),

  base_eur numeric(9,2) not null default 0,
  n_clases_propias integer not null default 0,
  variable_propias_eur numeric(9,2) not null default 0,
  n_clases_sustitucion integer not null default 0,
  variable_sustitucion_eur numeric(9,2) not null default 0,
  n_penalizaciones integer not null default 0,
  reparto_penalizaciones_eur numeric(9,2) not null default 0,
  n_clases_sin_tarifa integer not null default 0,
  total_eur numeric(9,2) generated always as (
    base_eur + variable_propias_eur + variable_sustitucion_eur + reparto_penalizaciones_eur
  ) stored,

  detalle jsonb not null default '[]'::jsonb,
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR', 'CONFIRMADA', 'PAGADA')),
  confirmada_en timestamptz,
  confirmada_por uuid,
  pagada_en timestamptz,
  pagada_por uuid,
  referencia_pago text,
  generada_en timestamptz not null default now(),

  unique (instructor_id, periodo_anio, periodo_mes)
);

create index if not exists idx_liquidaciones_instructoras_studio
  on public.liquidaciones_instructoras (studio_id, periodo_anio, periodo_mes);

comment on table public.liquidaciones_instructoras is
  'Fila 11 del informe estratégico: desglose transparente y auditable de lo que se debe a cada instructora por mes (base + variable por clase + variable de sustituciones + reparto de penalizaciones). Sin pago real — el pago se hace fuera de Tentare y solo se anota aquí.';

alter table public.liquidaciones_instructoras enable row level security;

-- Mismo criterio que instructor_tarifas: quien gestiona el equipo tiene
-- control total (generar, confirmar, marcar pagada).
create policy liquidaciones_gestion on public.liquidaciones_instructoras
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.puede_gestionar_equipo())
  with check (studio_id = public.current_studio_id() and public.puede_gestionar_equipo());

-- La instructora ve SU liquidación, solo una vez CONFIRMADA (nunca un
-- BORRADOR que puede cambiar) — es la pieza de transparencia que ataca el
-- problema declarado ("genera conflictos"): ella ve el mismo desglose que
-- ve la propietaria, no una cifra sin explicar.
create policy liquidaciones_propia_lectura on public.liquidaciones_instructoras
  for select to authenticated
  using (
    studio_id = public.current_studio_id()
    and instructor_id = public.current_instructor_id()
    and estado in ('CONFIRMADA', 'PAGADA')
  );

grant select, insert, update, delete on public.liquidaciones_instructoras to authenticated, service_role;
