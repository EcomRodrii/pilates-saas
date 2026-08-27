-- P-2 (17ª auditoría): un reembolso de una venta POS (datáfono/Bizum
-- presencial) no revertía nada — no se marcaba la venta, no quedaba rastro,
-- nadie se enteraba, y el cierre de caja para la gestoría quedaba inflado.
-- Columnas mínimas para que el webhook de Stripe pueda marcar la venta al
-- recibir charge.refunded, igual que recibos.fecha_devolucion.
alter table public.ventas_pos
  add column if not exists devuelta_en timestamptz null,
  add column if not exists importe_devuelto numeric null;

comment on column public.ventas_pos.devuelta_en is
  'P-2 (17ª auditoría): cuándo se reembolsó (parcial o total) el cobro de esta venta en Stripe. NULL = no reembolsada.';
comment on column public.ventas_pos.importe_devuelto is
  'P-2 (17ª auditoría): acumulado devuelto en euros (Stripe amount_refunded/100), no un delta.';
