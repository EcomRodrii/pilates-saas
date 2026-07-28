-- ═══════════════════════════════════════════════════════════════════════════
-- 0063 · TENTARE — Email de la gestoría (para enviarle el Cierre de año)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dónde enviar el paquete del cierre anual. Se guarda a nivel de estudio para
-- no volver a escribirlo cada año; el envío real lo dispara la propietaria
-- desde /cierre. Mismo patrón que google_calendar_email / gmail_email (0060).
-- Reversible: ALTER TABLE ... DROP COLUMN gestoria_email.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS gestoria_email text;

COMMENT ON COLUMN public.studios.gestoria_email IS
  'Email de la gestoría/asesor a quien se envía el paquete del Cierre de año. NULL = no configurado.';
