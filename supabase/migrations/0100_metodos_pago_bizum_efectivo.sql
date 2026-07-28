-- 0095 · F4 (E2) — Bizum/efectivo/transferencia como métodos de primera.
-- El CHECK de socios.metodo_pago_preferido solo permitía TARJETA/SEPA y el de
-- recibos.metodo_cobro no incluía EFECTIVO/TRANSFERENCIA, pero el type MetodoCobro
-- (y el cobro sin pasarela de F2) usa los 5. Se alinea la BD con el código/pitch.
alter table public.socios drop constraint if exists socios_metodo_pago_preferido_valido;
alter table public.socios add constraint socios_metodo_pago_preferido_valido
  check (metodo_pago_preferido = any (array['TARJETA','SEPA','BIZUM','EFECTIVO','TRANSFERENCIA']));

alter table public.recibos drop constraint if exists recibos_metodo_cobro_valido;
alter table public.recibos add constraint recibos_metodo_cobro_valido
  check (metodo_cobro is null or metodo_cobro = any (array['TARJETA','SEPA','BIZUM','EFECTIVO','TRANSFERENCIA']));
