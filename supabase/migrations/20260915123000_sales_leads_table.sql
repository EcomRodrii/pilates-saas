-- Tabla base del CRM: leads de Tentare para captación de estudios de Pilates
--
-- Evolución de plataforma_lead con campos de enriquecimiento y pipeline.
-- RLS: DENY by DEFAULT. Solo service_role después de validar permiso en servidor.

create table if not exists public.sales_leads (
  id               text primary key default gen_random_uuid()::text,

  -- Identidad
  email            text not null,
  nombre_contacto  text,
  apellido_contacto text,
  estudio_nombre   text,
  estudio_nombre_legal text,
  rol              text check (rol in ('PROPIETARIA', 'MANAGER', 'RECEPCION', 'OTRO', null)),

  -- Contacto
  telefono         text,
  ciudad           text,
  provincia        text,
  pais             text default 'ES',
  codigo_postal    text,
  direccion        text,

  -- Web y redes sociales
  website          text,
  website_domain   text, -- normalizado para dedup
  instagram_url    text,
  facebook_url     text,
  linkedin_url     text,

  -- Contexto de negocio
  software_actual  text,
  numero_empleados int,
  clientes_aprox   int,
  precio_mensual_aprox decimal(10, 2),

  -- Deduplicación
  google_place_id  text,
  phone_normalized text, -- E.164 format
  phone_checked_at timestamptz,

  -- Pipeline
  estado           text not null default 'NUEVO'
                     check (estado in ('NUEVO', 'INVESTIGANDO', 'LISTO', 'CONTACTADO',
                                      'RESPONDIO', 'INTERESADO', 'DEMO', 'TRIAL', 'CLIENTE',
                                      'NO_INTERESADO', 'NO_CONTACTAR', 'BOUNCE',
                                      'UNSUBSCRIBED', 'INVALID')),

  -- Origen y tracking
  origen           text not null default 'MANUAL'
                     check (origen in ('GOOGLE_PLACES', 'CSV_IMPORT', 'MANUAL', 'FORM', 'REFERRAL')),
  source_url       text,
  source_created_at timestamptz,
  discovered_at    timestamptz default now(),
  last_verified_at timestamptz,

  -- Email validation
  email_status     text default 'UNKNOWN'
                     check (email_status in ('VALID', 'INVALID', 'BOUNCE', 'UNSUBSCRIBED', 'UNKNOWN')),
  email_checked_at timestamptz,

  -- Gestión
  owner_id         uuid, -- quién lo lleva (FK a plataforma_admin o usuarios internos)
  studio_id        text references public.studios(id) on delete set null,
  tags             text[], -- array de etiquetas

  -- Notas e historial
  notas            text,
  razon_perdida    text,
  confidence       int check (confidence >= 0 and confidence <= 100),

  -- Timestamps
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  borrado_en       timestamptz -- soft delete
);

-- Deduplicación: prioridad email > dominio > teléfono > google_place_id
-- El email es la señal más fuerte pero puede cambiar
create unique index if not exists uq_sales_leads_email
  on public.sales_leads (lower(email))
  where borrado_en is null;

-- Google Place ID es la mejor señal (inmutable para un negocio físico)
create unique index if not exists uq_sales_leads_google_place_id
  on public.sales_leads (google_place_id)
  where google_place_id is not null and borrado_en is null;

-- Dominio + país: segunda señal (empresa puede cambiar email)
create unique index if not exists uq_sales_leads_domain_pais
  on public.sales_leads (website_domain, pais)
  where website_domain is not null and borrado_en is null;

-- Búsquedas frecuentes
create index if not exists idx_sales_leads_estado_fecha
  on public.sales_leads (estado, creado_en desc)
  where borrado_en is null;

create index if not exists idx_sales_leads_owner
  on public.sales_leads (owner_id)
  where borrado_en is null;

create index if not exists idx_sales_leads_studio
  on public.sales_leads (studio_id)
  where borrado_en is null;

create index if not exists idx_sales_leads_ciudad
  on public.sales_leads (ciudad)
  where borrado_en is null;

-- Full text search: nombre estudio + ciudad
create index if not exists idx_sales_leads_fts
  on public.sales_leads using gin (
    to_tsvector('spanish', coalesce(estudio_nombre, '') || ' ' || coalesce(ciudad, ''))
  );

-- Auditoría: tabla de soporte
alter table public.sales_leads enable row level security;
revoke all on public.sales_leads from public, anon, authenticated;

comment on table public.sales_leads is
  'CRM interno: leads de captación de estudios de Pilates. RLS: solo service_role tras validar crm.update.';
comment on column public.sales_leads.email_status is
  'VALID: comprobado. INVALID: sintaxis mala. BOUNCE: rebote en SMTP. UNSUBSCRIBED: pidió baja. UNKNOWN: no se ha chequedo aún.';
comment on column public.sales_leads.confidence is
  '0-100: confianza en los datos enriquecidos. Bajo si son scrapeados o genéricos.';
