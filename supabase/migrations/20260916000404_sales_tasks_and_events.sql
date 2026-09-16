-- Tareas comerciales (Fase 8)
create table if not exists public.sales_tasks (
  id               text primary key default gen_random_uuid()::text,
  lead_id          text not null references public.sales_leads(id) on delete cascade,

  tipo             text not null
                     check (tipo in ('LLAMAR', 'WHATSAPP', 'EMAIL', 'DEMO', 'FOLLOW_UP', 'REVISAR_TRIAL')),

  asignado_a       uuid,
  vencimiento      timestamptz,
  prioridad        int default 3 check (prioridad >= 1 and prioridad <= 5),

  estado           text not null default 'TODO'
                     check (estado in ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELED')),

  notas            text,

  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  borrado_en       timestamptz
);

create index if not exists idx_sales_tasks_lead
  on public.sales_tasks (lead_id) where borrado_en is null;

create index if not exists idx_sales_tasks_asignado
  on public.sales_tasks (asignado_a) where borrado_en is null;

create index if not exists idx_sales_tasks_estado
  on public.sales_tasks (estado) where borrado_en is null;

create index if not exists idx_sales_tasks_vencimiento
  on public.sales_tasks (vencimiento) where estado != 'DONE' and borrado_en is null;

alter table public.sales_tasks enable row level security;
revoke all on public.sales_tasks from public, anon, authenticated;

comment on table public.sales_tasks is 'Tareas comerciales por lead (Fase 8+).';

-- Auditoría: qué pasó con cada lead
create table if not exists public.sales_events (
  id               text primary key default gen_random_uuid()::text,
  lead_id          text references public.sales_leads(id) on delete cascade,

  tipo             text not null
                     check (tipo in ('LEAD_CREATED', 'LEAD_MOVED', 'LEAD_UPDATED', 'EMAIL_SENT',
                                    'CAMPAIGN_STARTED', 'CAMPAIGN_STOPPED', 'TASK_CREATED',
                                    'NOTE_ADDED', 'TAG_ADDED', 'OWNER_CHANGED')),

  actor_id         uuid, -- quién hizo la acción
  detalles         jsonb, -- contexto (old value, new value, etc.)

  creado_en        timestamptz not null default now()
);

create index if not exists idx_sales_events_lead
  on public.sales_events (lead_id);

create index if not exists idx_sales_events_tipo
  on public.sales_events (tipo);

alter table public.sales_events enable row level security;
revoke all on public.sales_events from public, anon, authenticated;

comment on table public.sales_events is 'Auditoría de cambios en leads (Fase 1+, para historial).';
