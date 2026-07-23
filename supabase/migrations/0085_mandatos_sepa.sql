-- F2 · Paso 8b — Cuaderno 19.14: mandatos SEPA + datos de acreedor del estudio.
--
-- Domiciliación bancaria "de siempre" (remesa al banco), INDEPENDIENTE de Stripe:
-- el "SEPA" que ya existía (socios.sepa_mandate_id) es de Stripe. Esto es el IBAN
-- propio de la socia + su mandato, para generar el fichero pain.008 (ver
-- lib/sepa-19-14.ts). Una socia con mandato VIGENTE entra en la remesa.

create table if not exists public.mandatos_sepa (
  id           text primary key,
  studio_id    text not null references public.studios(id),
  socio_id     text not null references public.socios(id),
  iban         text not null,
  ref_mandato  text not null,
  fecha_firma  date not null,
  estado       text not null default 'VIGENTE',   -- VIGENTE / CANCELADO
  creada_en    timestamptz not null default now()
);

alter table public.mandatos_sepa enable row level security;

create policy admin_mandatos_sepa on public.mandatos_sepa
  for all to authenticated
  using (studio_id = current_studio_id())
  with check (studio_id = current_studio_id());

-- Un solo mandato VIGENTE por socia.
create unique index if not exists uq_mandato_sepa_socio
  on public.mandatos_sepa (studio_id, socio_id) where (estado = 'VIGENTE');

-- Datos de acreedor SEPA del estudio (para la cabecera de la remesa).
alter table public.studios
  add column if not exists sepa_acreedor_id text,  -- identificador de acreedor SEPA
  add column if not exists sepa_iban text,          -- IBAN de la cuenta acreedora del estudio
  add column if not exists sepa_titular text;        -- titular de la cuenta
