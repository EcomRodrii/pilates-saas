-- Avisos a la propietaria cuando un webhook de la API no entrega
-- (lib/api-publica/webhooks/salud.ts).
--
-- `aviso_fallando_en`: cuándo se le avisó de que su programa no recibe los
-- avisos, en la racha de fallos en curso. Sirve para dos cosas: no repetir ese
-- aviso en cada reintento, y saber que hay que mandarle el de «vuelve a
-- funcionar» cuando entregue otra vez (y solo entonces: un fallo suelto que se
-- arregla solo no le cuenta nada). Se vacía al entregar y al reactivarlo.
--
-- Aditiva: la tabla ya es solo de servidor (sin grants para el cliente).
alter table public.api_webhooks add column if not exists aviso_fallando_en timestamptz;

do $$
begin
  if has_table_privilege('authenticated', 'public.api_webhooks', 'SELECT')
     or has_table_privilege('anon', 'public.api_webhooks', 'SELECT') then
    raise exception 'api_webhooks no puede leerse desde el cliente';
  end if;
end $$;
