-- Paso 7 de docs/marketing-integrations-arquitectura.md §8/§6: Klaviyo
-- necesita guardar el id de la lista donde caen las socias sincronizadas,
-- algo que ni access_token/refresh_token/expires_at cubren. jsonb genérico
-- (no una columna klaviyo_list_id) para que un proveedor futuro (Brevo,
-- Mailchimp) pueda guardar sus propios datos extra sin otra migración.
alter table public.integracion_credenciales
  add column if not exists metadata jsonb;

comment on column public.integracion_credenciales.metadata is
  'Datos extra por proveedor que no encajan en access_token/refresh_token/expires_at (p.ej. klaviyo.listId, la lista donde caen las socias sincronizadas). NULL para proveedores que no lo necesitan.';
