-- Paso 7: nombre de la organizacion en la cuenta de Klaviyo conectada, solo
-- para pintar la card en Configuracion -> Integraciones — mismo patron que
-- studios.gmail_email / studios.google_calendar_email.
alter table public.studios
  add column if not exists klaviyo_account_name text;

comment on column public.studios.klaviyo_account_name is
  'Nombre de la organizacion en la cuenta de Klaviyo conectada (OAuth), solo para pintar la card en Configuracion -> Integraciones. NULL = no conectado.';
