-- Historial de mensajes enviados (Fase 5+)
create table if not exists public.sales_messages (
  id               text primary key default gen_random_uuid()::text,
  lead_id          text not null references public.sales_leads(id) on delete cascade,
  campaign_id      text references public.sales_campaigns(id) on delete set null,
  campaign_step_id text references public.sales_campaign_steps(id) on delete set null,

  asunto           text,
  cuerpo           text,

  estado           text not null default 'PENDING'
                     check (estado in ('PENDING', 'SCHEDULED', 'SENDING', 'SENT', 'DELIVERED',
                                      'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED',
                                      'UNSUBSCRIBED', 'STOPPED', 'FAILED')),

  proveedor        text default 'SPACEMAIL' check (proveedor in ('SPACEMAIL', 'MOCK', 'RESEND')),
  proveedor_id     text, -- message_id externo

  enviado_en       timestamptz,
  entregado_en     timestamptz,
  abierto_en       timestamptz,
  respuesta_en     timestamptz,

  error            text,

  creado_en        timestamptz not null default now()
);

create index if not exists idx_sales_messages_lead
  on public.sales_messages (lead_id);

create index if not exists idx_sales_messages_estado
  on public.sales_messages (estado);

alter table public.sales_messages enable row level security;
revoke all on public.sales_messages from public, anon, authenticated;

comment on table public.sales_messages is 'Historial de emails enviados (Fase 5+).';

-- Suppression list global: emails que no deben recibir outreach nunca
create table if not exists public.sales_suppressions (
  id               text primary key default gen_random_uuid()::text,
  email            text,
  dominio          text, -- domain part of email
  telefono         text, -- E.164 format
  razon            text not null
                     check (razon in ('UNSUBSCRIBED', 'BOUNCE', 'COMPLAINT', 'DO_NOT_CONTACT',
                                     'LEGAL_REQUEST', 'INVALID', 'FRAUDULENT')),
  source           text not null default 'MANUAL'
                     check (source in ('MANUAL', 'EMAIL_BOUNCE', 'UNSUBSCRIBE_LINK',
                                      'COMPLAINT', 'LEGAL', 'SPAM_REPORT')),
  creado_en        timestamptz not null default now(),

  -- Al menos uno debe estar presente
  check (email is not null or telefono is not null or dominio is not null)
);

create unique index if not exists uq_sales_suppressions_email
  on public.sales_suppressions (lower(email))
  where email is not null;

create unique index if not exists uq_sales_suppressions_phone
  on public.sales_suppressions (telefono)
  where telefono is not null;

create index if not exists idx_sales_suppressions_razon
  on public.sales_suppressions (razon);

alter table public.sales_suppressions enable row level security;
revoke all on public.sales_suppressions from public, anon, authenticated;

comment on table public.sales_suppressions is
  'Suppression list global: nunca enviar a estos emails/teléfonos. RLS: solo service_role.';
