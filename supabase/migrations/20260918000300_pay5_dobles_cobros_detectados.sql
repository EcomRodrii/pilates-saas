-- PAY-5: Tabla de registro de dobles cobros detectados
-- Problema: la tabla cobros_intentos registra intentos, pero nadie identifica
-- cuándo hay múltiples pagos exitosos sobre el MISMO recibo.
-- Solución: tabla de auditoría dobles_cobros_detectados con estado de revisión.

create table public.dobles_cobros_detectados (
  id text primary key default 'ddc-' || nanoid(),
  studio_id text not null references public.studios (id) on delete restrict,
  recibo_id text not null references public.recibos (id) on delete restrict,
  payment_intent_ids text[] not null,
  importe_centimos bigint not null check (importe_centimos > 0),
  -- Número de intentos exitosos detectados
  intentos_exitosos_count int not null check (intentos_exitosos_count > 1),
  -- Primera vez que se registró este doble cobro
  primera_fecha timestamptz not null,
  -- Última vez que se registró un intento exitoso en este grupo
  ultima_fecha timestamptz not null,
  -- Estado del análisis
  estado text not null check (estado in (
    'PENDIENTE_REVISION',  -- Detectado, a la espera de revisión
    'CONFIRMADO',          -- Verificado que es doble cobro real
    'FALSO_POSITIVO',      -- Investigación concluyó que no es doble cobro
    'RESUELTO'             -- Se emitió reembolso o crédito
  )) default 'PENDIENTE_REVISION',
  -- Notas del investigador / historial de resolución
  notas text,
  -- Quién revisó/resolvió
  revisado_por text,
  -- Cuándo se marcó como resuelto
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  metadata jsonb
) enable row level security;

-- RLS: solo lectura para propietario/manager/recepción, escritura para service_role
create policy "dobles_cobros_detectados_lectura" on public.dobles_cobros_detectados
  for select
  to authenticated, service_role
  using (
    studio_id in (select id from public.studios where id = current_studio_id())
    or auth.role() = 'service_role'
  );

create policy "dobles_cobros_detectados_escritura_service_role" on public.dobles_cobros_detectados
  for insert
  to service_role
  with check (auth.role() = 'service_role');

create policy "dobles_cobros_detectados_update_service_role" on public.dobles_cobros_detectados
  for update
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Índices para búsqueda eficiente
create index dobles_cobros_detectados_studio_id on public.dobles_cobros_detectados (studio_id);
create index dobles_cobros_detectados_recibo_id on public.dobles_cobros_detectados (recibo_id);
create index dobles_cobros_detectados_estado on public.dobles_cobros_detectados (estado);
create index dobles_cobros_detectados_creado_en on public.dobles_cobros_detectados (creado_en desc);

-- Grants
grant select on public.dobles_cobros_detectados to authenticated, service_role;
grant insert on public.dobles_cobros_detectados to service_role;
grant update on public.dobles_cobros_detectados to service_role;
