-- ─────────────────────────────────────────────────────────────────────────────
-- F0 · Cifras (C2): enlazar las ventas antiguas del TPV con su recibo gemelo.
--
-- Las primeras ventas del TPV (junio-julio de 2026, formato antiguo de `items`,
-- sin líneas en `ventas_pos_lineas`) se guardaron sin `recibo_id`. Para 12 de
-- ellas el navegador SÍ creó un recibo `rec-pos-*` en la misma llamada —mismo
-- estudio, misma clienta, mismo importe, mismo día y un id generado en el mismo
-- milisegundo—, pero nunca escribió el enlace. Ese recibo ya cuenta en los
-- ingresos, así que enlazarlo NO cambia ninguna cifra: lo que cambia es que la
-- devolución de esas ventas, si la hubiera, llegaría a su recibo
-- (`trg_venta_pos_devolucion_a_recibo`) y que se sabe de qué venta es cada uno.
--
-- Solo se enlaza lo que es inequívoco: cada par se nombra explícitamente y,
-- además, se exige en el momento de aplicar que los dos sigan coincidiendo y
-- sin enlazar. Si algún par ha cambiado, se salta (y el NOTICE lo cuenta).
--
-- De paso se rellena `recibos.metodo_cobro` cuando está vacío, con el método
-- de su venta: es el método con el que se cobró de verdad, no una suposición
-- (DATAFONO se guarda como TARJETA, igual que hace `venta-servidor.ts`).
--
-- Las 7 ventas de esa época SIN recibo gemelo (667,50 €) NO se tocan: no hay
-- nada con lo que enlazarlas y crearles un recibo sería inventar un apunte. Se
-- quedan tal cual, visibles como «venta del TPV sin recibo» (ver
-- `lib/pos/ventas-sin-recibo.ts`) para que se pueda investigar su origen.
--
-- Reversible: `update ventas_pos set recibo_id = null where id in (…)` con los
-- mismos ids de abajo.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_enlazadas integer := 0;
  v_metodos integer := 0;
  v_par record;
begin
  for v_par in
    select * from (values
      ('vpos-1783558153062-qxav6', 'rec-pos-1783558153062-6n331'),
      ('vpos-1783582671484-oeda8', 'rec-pos-1783582671484-bz5bg'),
      ('vpos-1783583983054-x0d1e', 'rec-pos-1783583983055-xney8'),
      ('vpos-mrf0nv4i-1-c8p7v',    'rec-pos-mrf0nv4k-2-lfv4i'),
      ('vpos-mrj35t4m-1-xblqd',    'rec-pos-mrj35t4n-2-hei8z'),
      ('vpos-mrj360b0-4-oopfu',    'rec-pos-mrj360b1-5-jk4fu'),
      ('vpos-mrpron9r-1-i0oy9',    'rec-pos-mrpron9s-2-p7cv7'),
      ('vpos-mrt1uyw6-1-zp74v',    'rec-pos-mrt1uyw8-2-3tehn'),
      ('vpos-mrt1wc91-4-2ojd4',    'rec-pos-mrt1wc92-5-bu392'),
      ('vpos-mrt3nidv-2-d6j11',    'rec-pos-mrt3nidw-3-cabck'),
      ('vpos-mrt4exca-2-a0dh9',    'rec-pos-mrt4exca-3-0l8b1'),
      ('vpos-mrt4f31r-5-sq5x7',    'rec-pos-mrt4f31r-6-4o0pg')
    ) as p(venta_id, recibo_id)
  loop
    update public.ventas_pos v
       set recibo_id = v_par.recibo_id
      from public.recibos r
     where v.id = v_par.venta_id
       and r.id = v_par.recibo_id
       and v.recibo_id is null
       and v.estado = 'PAGADA'
       and r.studio_id = v.studio_id
       and r.socio_id is not distinct from v.socio_id
       and r.importe = v.total
       and r.fecha_cobro = (v.realizada_en at time zone 'Europe/Madrid')::date
       and not exists (select 1 from public.ventas_pos o where o.recibo_id = v_par.recibo_id);
    if found then
      v_enlazadas := v_enlazadas + 1;
      update public.recibos r
         set metodo_cobro = case v.metodo_pago when 'DATAFONO' then 'TARJETA' else v.metodo_pago end
        from public.ventas_pos v
       where r.id = v_par.recibo_id and v.id = v_par.venta_id
         and r.metodo_cobro is null
         and v.metodo_pago in ('TARJETA', 'DATAFONO', 'EFECTIVO', 'BIZUM', 'TRANSFERENCIA', 'SEPA');
      if found then v_metodos := v_metodos + 1; end if;
    end if;
  end loop;
  raise notice 'ventas_pos enlazadas con su recibo: % de 12 · métodos de cobro rellenados: %', v_enlazadas, v_metodos;
end $$;
