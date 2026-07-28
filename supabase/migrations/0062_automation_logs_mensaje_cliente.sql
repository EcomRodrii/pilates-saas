-- ═══════════════════════════════════════════════════════════════════════════
-- 0061 · automation_logs.mensaje_cliente — separar nota interna de mensaje real
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BUG: `detalle` se usaba a la vez como (a) nota interna para la propietaria
-- ("Marta lleva 23 días sin venir, ¿le ofrecemos un 15%?") y (b) el texto que
-- se reenviaba tal cual a la clienta al aprobar una oferta de reactivación.
-- Cuando la redacción con IA fallaba, el fallback era la propia nota interna
-- — así que la socia podía recibir literalmente la frase pensada para la
-- propietaria, en tercera persona sobre ella misma.
--
-- Ahora `detalle` queda como nota interna PURA, y `mensaje_cliente` (nuevo,
-- nullable) guarda el texto que de verdad se envía o se enviaría a la
-- clienta — null cuando la acción no implica ningún envío a cliente.
--
-- Reversible: DROP COLUMN (additiva, no toca datos existentes).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.automation_logs
  ADD COLUMN IF NOT EXISTS mensaje_cliente text;
