-- Auditoría CTO: un recibo EN_CURSO (adeudo SEPA en vuelo) no guardaba el
-- PaymentIntent que lo generó — solo quedaba en un `extra` de Sentry. Sin esa
-- columna no hay forma de volver a preguntarle a Stripe por un recibo que se
-- quedó EN_CURSO para siempre porque el webhook nunca llegó (entrega fallida
-- tras los reintentos de Stripe, o un evento perdido). La usa el
-- reconciliador nuevo de lib/inngest/dunning.ts.
ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
