-- ═══════════════════════════════════════════════════════════════════════════
-- Especialista ONBOARDING (lib/decision/especialistas/onboarding.ts): amplía
-- el CHECK de recomendaciones.especialista, igual que hizo 0052 para
-- CAPTACION. Mismo motivo: `recomendaciones.especialista` tiene un CHECK
-- desde 0003_decision_os.sql que ya no cubre todos los EspecialistaId reales
-- del código — sin ampliarlo, dbUpsertRecomendacion falla en runtime en
-- cuanto ONBOARDING emite su primera candidata.
--
-- De paso, `decision_feature_flags.flag` tiene el MISMO problema para
-- CAPTACION desde que se creó (0003_decision_os.sql nunca se tocó al añadir
-- CAPTACION en 0052 — solo se amplió el CHECK de `recomendaciones`, no el de
-- `decision_feature_flags`) — un fallo real y aparte de ONBOARDING, aditivo
-- ampliarlo aquí de paso en vez de dejarlo pendiente otra vez.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.recomendaciones
  DROP CONSTRAINT IF EXISTS recomendaciones_especialista_check;

ALTER TABLE public.recomendaciones
  ADD CONSTRAINT recomendaciones_especialista_check
  CHECK (especialista IN
    ('RETENCION','INGRESOS','AGENDA','MARKETING','FINANZAS','EQUIPO','CAPTACION','ONBOARDING'));

ALTER TABLE public.decision_feature_flags
  DROP CONSTRAINT IF EXISTS decision_feature_flags_flag_check;

ALTER TABLE public.decision_feature_flags
  ADD CONSTRAINT decision_feature_flags_flag_check
  CHECK (flag IN
    ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO','CAPTACION','ONBOARDING'));
