-- ═══════════════════════════════════════════════════════════════════════════
-- Resumen semanal del Umbral (semanas silenciosas): amplía el CHECK de
-- decision_feature_flags.flag para admitir 'RESUMEN_SEMANAL' — el opt-out
-- por estudio del email de "semana tranquila" (lib/inngest/resumen-semanal.ts).
-- Mismo motivo/patrón que 20260804115835 (CAPTACION/ONBOARDING): sin esto,
-- dbSetFeatureFlag('RESUMEN_SEMANAL', ...) fallaría en runtime en cuanto
-- una propietaria intentara desactivarlo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.decision_feature_flags
  DROP CONSTRAINT IF EXISTS decision_feature_flags_flag_check;

ALTER TABLE public.decision_feature_flags
  ADD CONSTRAINT decision_feature_flags_flag_check
  CHECK (flag IN
    ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO','CAPTACION','ONBOARDING','RESUMEN_SEMANAL'));
