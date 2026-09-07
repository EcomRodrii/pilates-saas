-- ─────────────────────────────────────────────────────────────────────────────
-- Cobrar un recibo por el datáfono, desde el mostrador
--
-- Hasta ahora una socia que venía a pagar su cuota solo podía pagarla EN
-- EFECTIVO desde el TPV. Con tarjeta había que salir a /cobros y marcarla a
-- mano — que es exactamente la transacción de tarjeta dada por buena sin que
-- ningún proveedor la confirme que este rediseño existe para impedir.
--
-- Esta columna guarda el PaymentIntent EN VUELO mientras la clienta pasa la
-- tarjeta, para poder volver a preguntarle a Stripe aunque el navegador del
-- mostrador se recargue a mitad.
--
-- ⚠️ NO se reutiliza `stripe_payment_intent_id`. Esa columna es el cargo que SÍ
-- salió bien, y de ella cuelga el camino de reembolsos: dejar ahí un intento
-- que todavía puede fallar haría que un reembolso apuntara a un cobro que
-- nunca ocurrió. Son dos cosas distintas y merecen dos columnas.
--
-- El cierre del cobro NO vive aquí: lo hace `confirmarCobroRecibo`, el punto
-- único que ya comparten el webhook y el conciliador. Este flujo se suma como
-- una fuente más, no como un camino paralelo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS cobro_mostrador_pi text;

COMMENT ON COLUMN public.recibos.cobro_mostrador_pi IS
  'PaymentIntent en vuelo de un cobro por datáfono/Bizum lanzado desde el TPV. Se limpia al cerrarse el cobro. NO es el cargo bueno: ese vive en stripe_payment_intent_id, de donde cuelgan los reembolsos.';

-- Buscar el recibo por su intento en vuelo: lo necesita el webhook cuando
-- llega antes que la consulta del mostrador. Parcial, porque casi todas las
-- filas lo tienen a NULL.
CREATE INDEX IF NOT EXISTS recibos_cobro_mostrador_pi_idx
  ON public.recibos (cobro_mostrador_pi)
  WHERE cobro_mostrador_pi IS NOT NULL;
