-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 Auditoría 27ª pasada (8 sep 2026) — P-1.
--
-- Bizum del TPV es una Checkout Session, no un PaymentIntent suelto — pero solo
-- se guardaba el PaymentIntent, y `sesion.id` se descartaba. Sin él no hay
-- forma de invalidar el enlace de pago cuando alguien pulsa "Cancelar" en el
-- mostrador: `paymentIntents.cancel` sobre el PI de una Checkout Session no
-- impide que la clienta complete el pago abriendo igualmente la URL (el enlace
-- lo invalida `checkout.sessions.expire`, no cancelar el PI por su cuenta) —
-- de ahí el doble cobro real: cancelar en el mostrador + cobrar en efectivo, y
-- la clienta paga el QR después, que sigue siendo válido.
--
-- Columna nueva en los dos caminos que crean una sesión de Bizum en el
-- mostrador (venta del TPV y cobro de un recibo ya existente) — nunca se toca
-- `stripe_payment_intent_id`/`cobro_mostrador_pi`, que siguen siendo la
-- referencia que confirma el cobro.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ventas_pos
  add column checkout_session_id text;

comment on column public.ventas_pos.checkout_session_id is
  'Checkout Session de Stripe cuando el método es Bizum (["card","bizum"]). Permite expirarla de verdad al cancelar en el mostrador, en vez de solo cancelar el PaymentIntent (que no invalida el enlace de pago). NULL para datáfono/manual.';

alter table public.recibos
  add column cobro_mostrador_checkout_session_id text;

comment on column public.recibos.cobro_mostrador_checkout_session_id is
  'Igual que ventas_pos.checkout_session_id, pero para el cobro de un recibo ya existente desde el mostrador (app/api/pos/recibo). Distinta de recibos.checkout_session_id (esa es del checkout del PORTAL, un camino de pago independiente).';
