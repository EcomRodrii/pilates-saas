-- Paso 8 de docs/marketing-integrations-arquitectura.md §6/§8: Mailchimp,
-- repeticion del patron de Klaviyo (paso 7) — nombre de la cuenta de
-- Mailchimp conectada (BYO account de la propietaria), solo para pintar la
-- card en Configuracion -> Integraciones. Mismo patron que
-- studios.klaviyo_account_name / studios.gmail_email.
alter table public.studios
  add column if not exists mailchimp_account_name text;

comment on column public.studios.mailchimp_account_name is
  'Nombre de la cuenta de Mailchimp conectada (OAuth, BYO account), solo para pintar la card en Configuracion -> Integraciones. NULL = no conectado.';
