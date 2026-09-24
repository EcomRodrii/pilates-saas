-- AUT-6: id del envío en Resend, para cruzar un rebote (email_rebotes.email_id) con el
-- envío de automatización o campaña que lo provocó. Nullable y sin backfill: los
-- logs anteriores no lo guardaron y no hay de dónde reconstruirlo.
alter table public.automation_logs add column if not exists provider_id text;
comment on column public.automation_logs.provider_id is
  'Id del envío en el proveedor (Resend). Permite atribuir un rebote/queja a un envío concreto.';
create index if not exists automation_logs_provider_id_idx
  on public.automation_logs (provider_id) where provider_id is not null;
