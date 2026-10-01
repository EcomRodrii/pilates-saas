-- ─────────────────────────────────────────────────────────────────────────────
-- F0 · Cifras (C3): una devolución del TPV tiene que llegar a su recibo.
--
-- Desde el rediseño del TPV (#1718) cada venta pagada crea un recibo
-- `rec-pos-*` COBRADO por el total (lib/pos/venta-servidor.ts), y ese recibo es
-- lo que cuentan Inicio, Cobros e Informes. Pero las devoluciones solo anotan
-- en `ventas_pos`:
--   · `devolver_venta_pos` (devolución en el mostrador) escribe
--     `ventas_pos.importe_devuelto` / `devuelta_en` y no toca `recibos`;
--   · el webhook de Stripe (`registrarDevolucion`) escribe en `ventas_pos`
--     cuando el cargo es de una venta del TPV, y tampoco toca el recibo.
-- Resultado: tras cualquier devolución del TPV, el recibo seguía COBRADO por el
-- importe entero e inflaba los ingresos. Hoy son 0 € porque no ha habido
-- ninguna, pero pasaría con la primera.
--
-- Un trigger y no dos parches en TS: hay dos escritores (una RPC SECURITY
-- DEFINER y el webhook) y cualquiera nuevo heredaría el mismo agujero. Mismo
-- principio que `trg_penalizacion_no_show`: la base decide una vez.
--
-- Lo que refleja, y lo que no:
--   · `importe_devuelto` del recibo = el acumulado de la venta (valor absoluto,
--     no incremento: un reintento lo deja igual).
--   · Devolución TOTAL (`devuelta_en` puesto) → recibo DEVUELTO con la fecha de
--     la devolución en hora de Madrid. Mismo criterio que
--     `procesar-reembolso.ts`: solo el total cambia el estado; un parcial deja
--     el recibo COBRADO y las cifras restan `importe_devuelto`.
--   · Si la venta deja de estar devuelta entera (el webhook pone `devuelta_en`
--     a null), el recibo vuelve a COBRADO — solo si lo había puesto DEVUELTO
--     esta misma regla.
--   · Nunca toca un recibo ANULADO ni uno de otro estudio.
--
-- Un fallo aquí NO tumba la devolución: el dinero ya salió en Stripe antes de
-- escribir el libro («el dinero se devuelve ANTES de tocar el libro»,
-- `devolver_venta_pos`), y perder también el apunte de la venta sería peor. Se
-- avisa con WARNING, igual que `auditar_cambio_dinero`.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.reflejar_devolucion_venta_pos_en_recibo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.recibo_id is null then
    return null;
  end if;
  if new.importe_devuelto is not distinct from old.importe_devuelto
     and new.devuelta_en is not distinct from old.devuelta_en
     and new.recibo_id is not distinct from old.recibo_id then
    return null;
  end if;

  begin
    update public.recibos r
       set importe_devuelto = least(coalesce(new.importe_devuelto, 0), r.importe),
           estado = case
             when new.devuelta_en is not null and r.estado = 'COBRADO' then 'DEVUELTO'
             when new.devuelta_en is null and old.devuelta_en is not null and r.estado = 'DEVUELTO' then 'COBRADO'
             else r.estado end,
           fecha_devolucion = case
             when new.devuelta_en is not null and r.estado = 'COBRADO'
               then (new.devuelta_en at time zone 'Europe/Madrid')::date
             when new.devuelta_en is null and old.devuelta_en is not null and r.estado = 'DEVUELTO'
               then null
             else r.fecha_devolucion end
     where r.id = new.recibo_id
       and r.studio_id = new.studio_id
       and r.estado <> 'ANULADO';
  exception when others then
    raise warning 'VENTA_POS_DEVOLUCION_SIN_RECIBO (%): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_venta_pos_devolucion_a_recibo on public.ventas_pos;
create trigger trg_venta_pos_devolucion_a_recibo
  after update of importe_devuelto, devuelta_en, recibo_id on public.ventas_pos
  for each row execute function public.reflejar_devolucion_venta_pos_en_recibo();

-- Función de trigger SECURITY DEFINER: nadie del cliente la llama (y Postgres
-- no deja llamarla fuera de un trigger), pero el default ACL le da EXECUTE a
-- anon y authenticated directamente. Los tres pasos de siempre.
revoke execute on function public.reflejar_devolucion_venta_pos_en_recibo() from public;
revoke execute on function public.reflejar_devolucion_venta_pos_en_recibo() from anon;
revoke execute on function public.reflejar_devolucion_venta_pos_en_recibo() from authenticated;
grant execute on function public.reflejar_devolucion_venta_pos_en_recibo() to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.reflejar_devolucion_venta_pos_en_recibo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reflejar_devolucion_venta_pos_en_recibo()', 'EXECUTE') then
    raise exception 'reflejar_devolucion_venta_pos_en_recibo: el cliente no debería poder ejecutarla';
  end if;
end $$;
