-- Devoluciones y disputas perdidas de las facturas del SaaS (billing_facturas.devuelto_cents).
--
-- La columna existía desde el libro (migr 20261116224610) pero nada la rellenaba: «cobrado» no
-- descontaba ninguna devolución. Esta función la sube cuando Stripe devuelve el cargo de una
-- factura o se pierde una disputa. Los reembolsos de Stripe son ACUMULADOS (`amount_refunded` ya es
-- el total devuelto), y una devolución no se deshace, así que solo sube: `greatest`. Nunca pasa del
-- total de la factura. Idempotente: repetir el evento no cambia nada.
create or replace function public.billing_registrar_devolucion(p_stripe_invoice_id text, p_devuelto_cents integer)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_filas integer;
begin
  if p_devuelto_cents is null or p_devuelto_cents < 0 then
    raise exception 'devolución no válida: %', p_devuelto_cents using errcode = '22023';
  end if;
  update public.billing_facturas
     set devuelto_cents = least(total_cents, greatest(devuelto_cents, p_devuelto_cents)),
         actualizada_en = now()
   where stripe_invoice_id = p_stripe_invoice_id;
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

-- ⚠️ pg_default_acl da EXECUTE a anon/authenticated DIRECTO: los tres pasos.
revoke execute on function public.billing_registrar_devolucion(text, integer) from public, anon, authenticated;
grant execute on function public.billing_registrar_devolucion(text, integer) to service_role;
