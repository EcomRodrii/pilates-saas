-- ─────────────────────────────────────────────────────────────────────────────
-- F0 · Cifras: una devolución TOTAL del TPV deja el recibo devuelto ENTERO.
--
-- `devolver_venta_pos` da la venta por devuelta entera con 1 céntimo de
-- tolerancia (acumulado ≥ total − 0,01, por el redondeo por línea). El trigger
-- de 20261001122131 copiaba ese acumulado tal cual al recibo, así que podía
-- quedar DEVUELTO con 85,49 de 85,50: para `esReciboCobrable` eso es «devuelto
-- POR EL BANCO» (no está devuelto entero), y la socia salía con un impago y
-- bloqueada para reservar, por una devolución que le había hecho el estudio.
-- Probado con execute_sql + ROLLBACK en la revisión de F0.
--
-- Si la venta está devuelta entera (`devuelta_en` puesto), el recibo lo está
-- por su importe completo. El resto de la regla no cambia.
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
       set importe_devuelto = case
             when new.devuelta_en is not null then r.importe
             else least(coalesce(new.importe_devuelto, 0), r.importe) end,
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

-- CREATE OR REPLACE con la misma firma conserva los grants, pero se reafirman
-- y se comprueban: es la regla del repo para cualquier función SECURITY DEFINER.
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
