-- PAY-4: Auditoría de intentos de cobro para detectar dobles
-- Tabla que registra cada intento de cobro con su destino (origen) y resultado (desenlace)
-- Usa payment_intent_id como PK para garantizar idempotencia

create table cobros_intentos (
  payment_intent_id text primary key,
  studio_id uuid not null,
  recibo_id text not null,
  importe_centimos integer not null,
  origen text not null check (origen in ('checkout', 'off_session', 'webhook', 'manual')),
  desenlace text not null check (desenlace in ('cobrado', 'fallido', 'pendiente', 'reintentando')),
  creado_en timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now(),
  constraint fk_cobros_intentos_recibos foreign key (recibo_id) references recibos(id) on delete cascade
);

create index idx_cobros_intentos_studio_id on cobros_intentos(studio_id);
create index idx_cobros_intentos_recibo_id on cobros_intentos(recibo_id);

-- RLS: solo service_role puede escribir, authenticated solo puede leer los suyos (por studio_id)
alter table cobros_intentos enable row level security;

create policy "cobros_intentos_service_role_writes" on cobros_intentos
  for insert to service_role
  with check (true);

create policy "cobros_intentos_authenticated_reads_own_studio" on cobros_intentos
  for select to authenticated
  using (studio_id in (select studio_id from sesion_activa_vista));

create policy "cobros_intentos_service_role_reads" on cobros_intentos
  for select to service_role
  using (true);

create policy "cobros_intentos_service_role_updates" on cobros_intentos
  for update to service_role
  using (true)
  with check (true);
