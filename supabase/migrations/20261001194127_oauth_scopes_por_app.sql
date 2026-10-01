-- ─────────────────────────────────────────────────────────────────────────────
-- OAuth: cada app tiene una lista de permisos que puede pedir.
--
-- Hasta ahora una app del catálogo podía pedir cualquier scope; solo la recortaba
-- el rol de quien la autorizaba. Con los scopes nuevos de la API (datos fiscales
-- de las clientas, facturas), eso dejaba que una app de automatizaciones pidiera
-- el NIF de todas las alumnas con que la propietaria pulsara «Autorizar».
--
-- `scopes_permitidos` es lo que cada app PUEDE pedir. Se aplica en dos sitios
-- (lib/api-publica/scopes.ts):
--   · al autorizar: lo pedido se recorta a esta lista (y al rol); lo que queda
--     fuera se enseña en la pantalla de consentimiento;
--   · en CADA petición (`conApiPublica`): los scopes del token se cruzan con la
--     lista de HOY, así que recortarla vale al momento, también para los tokens
--     ya emitidos.
--
-- Una app nueva nace sin ninguno (default vacío): no pide nada hasta que se le
-- da su lista, en la misma migración que la registra.
--
-- Zapier: exactamente lo que tiene concedido hoy su único consentimiento vivo
-- (medido el 1-oct-2026). No cambia nada para quien ya lo usa, y le cierra
-- `clientas:datos_fiscales`, `facturas:leer` y `planes:leer`, que no pide.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.oauth_clientes
  add column if not exists scopes_permitidos text[] not null default '{}'::text[];

update public.oauth_clientes
   set scopes_permitidos = array[
     'clientas:leer', 'clientas:escribir', 'reservas:leer', 'reservas:escribir', 'pagos:leer',
     'instructores:leer', 'notas:leer', 'notas:escribir', 'tareas:leer', 'tareas:escribir',
     'leads:leer', 'leads:escribir'
   ]::text[]
 where id = 'zapier';

do $$
begin
  if has_table_privilege('authenticated', 'public.oauth_clientes', 'UPDATE')
     or has_table_privilege('anon', 'public.oauth_clientes', 'UPDATE') then
    raise exception 'oauth_clientes no puede cambiarse desde el cliente';
  end if;
end $$;
