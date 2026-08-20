-- Anotación informativa: fecha opcional hasta la que un precio es "de oferta".
-- Puramente UI (badge en tab-planes.tsx). No afecta a plan.precio, checkout,
-- Stripe, Decision OS ni MRR. Sin RLS nueva: hereda la política existente de
-- planes_tarifa. Sin índice: no se filtra por esta columna, solo se muestra.
alter table public.planes_tarifa
  add column if not exists oferta_hasta date null default null;

comment on column public.planes_tarifa.oferta_hasta is
  'Fecha opcional hasta la que el precio actual es una oferta temporal. Solo informativo para la UI (badge "Oferta hasta"/aviso de caducada); no cambia plan.precio ni ninguna lógica de cobro.';
