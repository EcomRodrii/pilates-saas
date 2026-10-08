-- Factura automática por estudio (9-oct-2026, petición del fundador).
--
-- «Facturar automáticamente» es un ajuste del ESTUDIO, independiente de
-- Veri*Factu: con él apagado no sale factura sola al cobrar (la manual sigue
-- disponible), y con él encendido sale en todo cobro menos el efectivo (eso ya
-- era así). No lee ni condiciona `modo_facturacion` ni el envío a la AEAT.
--
-- De serie true: ningún estudio cambia de comportamiento. No es retroactivo.
-- Lo cambia solo la propietaria, por /api/facturacion/automatica (service-role):
-- `authenticated` no tiene GRANT de UPDATE de tabla sobre studios, solo por
-- columna, y esta columna nace sin él.
alter table public.studios
  add column if not exists facturar_automatico boolean not null default true;

comment on column public.studios.facturar_automatico is
  'true = al cobrar sale la factura sola (salvo efectivo). false = solo factura manual. Independiente de modo_facturacion (Veri*Factu).';
