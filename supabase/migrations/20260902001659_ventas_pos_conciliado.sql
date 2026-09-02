-- F-12/F-13, rediseño de fondo. Mismo criterio que recibos.conciliado_en/
-- conciliado_por (ver esa migración) aplicado a POS — sin `factura_pendiente_sellar`
-- aquí a propósito: el POS no sella factura Veri*Factu hoy (decisión de producto,
-- ver facturas.venta_pos_id), así que no hay nada que reintentar todavía.
alter table public.ventas_pos
  add column conciliado_en timestamptz null,
  add column conciliado_por text null check (conciliado_por in ('webhook','conciliador','manual'));

comment on column public.ventas_pos.conciliado_en is
  'F-12/F-13: cuándo se verificó esta venta de punta a punta contra Stripe (reembolsos incluidos). NULL = nunca verificado.';
comment on column public.ventas_pos.conciliado_por is
  'webhook = lo confirmó el webhook de Stripe en tiempo real. conciliador = lo recuperó el barrido periódico. manual = una persona.';
