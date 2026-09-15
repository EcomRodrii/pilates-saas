-- Campañas y pasos de secuencia (Fase 5+)
-- Tablas para futuro; Fase 1 solo usa sales_leads en Kanban.

create table if not exists public.sales_campaigns (
  id               text primary key default gen_random_uuid()::text,
  nombre           text not null,
  descripcion      text,
  audience_count   int default 0,
  estado           text not null default 'DRAFT'
                     check (estado in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELED')),
  created_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  scheduled_for    timestamptz,
  borrado_en       timestamptz
);

create index if not exists idx_sales_campaigns_estado
  on public.sales_campaigns (estado) where borrado_en is null;

create index if not exists idx_sales_campaigns_created_by
  on public.sales_campaigns (created_by) where borrado_en is null;

alter table public.sales_campaigns enable row level security;
revoke all on public.sales_campaigns from public, anon, authenticated;

comment on table public.sales_campaigns is 'Campañas de prospección (Fase 5+). RLS: solo service_role.';

-- Pasos dentro de una campaña (Fase 5+)
create table if not exists public.sales_campaign_steps (
  id               text primary key default gen_random_uuid()::text,
  campaign_id      text not null references public.sales_campaigns(id) on delete cascade,
  orden            int not null,
  asunto           text,
  cuerpo           text, -- plaintext con variables {{first_name}}, {{studio_name}}, etc.
  delay_days       int default 0, -- enviar X días después del anterior
  conditions       jsonb, -- opcional: lógica condicional
  enabled          bool default true,
  created_at       timestamptz not null default now(),

  unique (campaign_id, orden)
);

create index if not exists idx_sales_campaign_steps_campaign
  on public.sales_campaign_steps (campaign_id);

alter table public.sales_campaign_steps enable row level security;
revoke all on public.sales_campaign_steps from public, anon, authenticated;

comment on table public.sales_campaign_steps is 'Pasos dentro de una campaña (Fase 5+).';
