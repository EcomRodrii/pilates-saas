-- PAY-4: Tabla de auditoría de intentos de cobro
-- Problema: sin este libro no se puede reconstruir si hubo un doble cobro.
-- Solución: registrar cada intento (payment_intent_id) con estudio, recibo, importe y desenlace.

create table public.cobros_intentos (
  payment_intent_id text primary key,
  studio_id text not null references public.studios (id) on delete restrict,
  recibo_id text not null references public.recibos (id) on delete restrict,
  importe_centimos bigint not null check (importe_centimos > 0),
  origen text not null check (origen in (
    'checkout',          -- Checkout pagado por cliente
    'off_session',       -- Cobro automático (dunning)
    'manual',            -- Marcado como cobrado por staff
    'renovacion'         -- Renovación automática de suscripción
  )),
  desenlace text not null check (desenlace in (
    'cobrado',           -- PaymentIntent succeeded
    'fallido',           -- PaymentIntent failed o requires_action
    'disputado',         -- Chargeback o disputa abierta
    'revertido'          -- Refund o reversal
  )),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  metadata jsonb
) enable row level security;

-- Auditoría: solo lectura para authenticated/service_role, escritura solo para service_role
create policy "cobros_intentos_lectura_rol" on public.cobros_intentos
  for select
  using (true);  -- Todos los roles pueden leer (datos no sensibles más allá del recibo)

create policy "cobros_intentos_escritura_service_role" on public.cobros_intentos
  for insert
  with check (auth.role() = 'service_role');

create policy "cobros_intentos_update_service_role" on public.cobros_intentos
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Índices para reconstrucción de auditoría
create index cobros_intentos_studio_id on public.cobros_intentos (studio_id);
create index cobros_intentos_recibo_id on public.cobros_intentos (recibo_id);
create index cobros_intentos_creado_en on public.cobros_intentos (creado_en desc);
create index cobros_intentos_desenlace on public.cobros_intentos (desenlace);

-- Grants
grant select on public.cobros_intentos to authenticated, service_role;
grant insert on public.cobros_intentos to service_role;
grant update on public.cobros_intentos to service_role;
