-- Revierte 20260820185911_studios_mailchimp_account_name.sql: Mailchimp
-- pasó de OAuth (BYO account con "nombre de cuenta conectada") a clave API
-- pegada por la propietaria (mismo patrón que Kisi/WhatsApp, tabla
-- `integraciones` genérica) — decisión explícita del usuario, 2026-08-20.
-- Sin OAuth no hay "nombre de cuenta" que pintar, así que la columna queda
-- huérfana desde el día en que se creó (ningún dato real llegó a escribirse).
alter table public.studios
  drop column if exists mailchimp_account_name;
