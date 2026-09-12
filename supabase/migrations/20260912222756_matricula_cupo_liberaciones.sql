-- P-1 (auditoría 58ª pasada, 2026-09-12): el cupo de matrícula gratis
-- reservado en un checkout online (Modo A y Modo B) solo se devolvía si el
-- cobro ni siquiera llegaba a crearse. Si se creaba y luego nadie pagaba
-- (la clienta abandona el checkout, Stripe rechaza el cobro), la plaza se
-- quedaba gastada para siempre sin que nadie la hubiera usado -- el caso más
-- común con Bizum.
--
-- Dos eventos del webhook pueden anunciar el mismo fallo para el MISMO
-- PaymentIntent (payment_intent.payment_failed y, después, checkout.session.
-- expired), así que devolver la plaza directamente desde los dos handlers
-- devolvería DOS plazas por una sola reserva. Mismo patrón compare-and-set ya
-- usado en este repo para dinero (codigos_descuento_consumos): una fila con
-- PK en payment_intent_id -- el primer aviso gana con el INSERT, el segundo
-- choca por 23505 y no libera nada. Ver liberarCupoMatriculaUnaVez.
create table if not exists public.matricula_cupo_liberaciones (
  payment_intent_id text primary key,
  plan_id text not null references public.planes_tarifa(id) on delete cascade,
  studio_id text not null references public.studios(id) on delete cascade,
  liberado_en timestamptz not null default now()
);

comment on table public.matricula_cupo_liberaciones is
  'Compare-and-set: garantiza que un cupo de matrícula gratis reservado se devuelve UNA sola vez por PaymentIntent, aunque payment_intent.payment_failed y checkout.session.expired lleguen los dos para el mismo intento fallido.';

alter table public.matricula_cupo_liberaciones enable row level security;
-- Sin ninguna policy a propósito (deny-by-default, mismo criterio que
-- codigos_descuento_consumos/widget_eventos): solo el webhook (service-role)
-- la toca.
