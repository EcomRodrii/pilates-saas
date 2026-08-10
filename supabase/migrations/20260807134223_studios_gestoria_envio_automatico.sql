-- ═══════════════════════════════════════════════════════════════════════════
-- Envío automático del Cierre a la gestoría. Mismo patrón que
-- compra_publica_modo (20260726124532): text + CHECK, no un enum de
-- Postgres. Solo 'trimestral' (no 'mensual'): computeCierreAnual no sabe
-- filtrar por mes, solo por trimestre/año — mandar "mensual" hoy sacaría el
-- trimestre entero cada vez, más confuso que útil.
--
-- gestoria_ultimo_envio_periodo guarda la clave del último periodo YA
-- enviado (ej. '2026-T1') — es la guardia de idempotencia: si el cron corre
-- más de una vez el mismo día (o Inngest reintenta) no reenvía.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS gestoria_envio_automatico text
    NOT NULL DEFAULT 'desactivado'
    CHECK (gestoria_envio_automatico IN ('desactivado', 'trimestral')),
  ADD COLUMN IF NOT EXISTS gestoria_ultimo_envio_periodo text;

COMMENT ON COLUMN public.studios.gestoria_envio_automatico IS
  'Cadencia de envío automático del Cierre a gestoria_email. desactivado = solo el botón manual (por defecto).';
COMMENT ON COLUMN public.studios.gestoria_ultimo_envio_periodo IS
  'Clave del último periodo ya enviado automáticamente (ej. "2026-T1"). Evita reenvío si el cron corre más de una vez el mismo día.';
