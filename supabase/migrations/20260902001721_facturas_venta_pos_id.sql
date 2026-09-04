-- F-12/F-13, rediseño de fondo — solo el enlace de esquema, SIN activar nada.
-- Decisión explícita del fundador: el POS puede llegar a necesitar factura
-- simplificada Veri*Factu el día que se descongele, pero decidir CÓMO (NIF
-- del receptor, IVA por línea de producto en vez de un único importe) es una
-- pieza de diseño fiscal aparte que no se resuelve aquí. Ningún llamador de
-- código escribe en esta columna todavía.
alter table public.facturas
  add column venta_pos_id text null references public.ventas_pos(id),
  add constraint facturas_entidad_unica
    check ((recibo_id is not null) <> (venta_pos_id is not null));

comment on column public.facturas.venta_pos_id is
  'F-12/F-13: enlace de esquema para el día que se decida sellar factura Veri*Factu de ventas POS. Sin activar — ningún código escribe aquí todavía.';
