-- Redirect URI real de la integración Zapier, obtenida al crear la app en
-- developer.zapier.com (Platform UI, integration id 245096). Sustituye el
-- array vacío del seed inicial (20260814100100) — sin esta URI en la
-- whitelist, /oauth/authorize rechaza cualquier intento de conexión.
update public.oauth_clientes
set redirect_uris = array['https://zapier.com/dashboard/auth/oauth/return/App245096CLIAPI/']
where id = 'zapier';
