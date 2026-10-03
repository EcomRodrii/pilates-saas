-- ═══════════════════════════════════════════════════════════════════════════
-- Interruptor «Redactar con IA» del estudio (contrato de encargo, 2-oct-2026).
-- ═══════════════════════════════════════════════════════════════════════════
-- Amplía el CHECK de decision_feature_flags.flag para admitir 'REDACCION_IA':
-- el opt-out por estudio de todo lo que la IA redacta sola, sin pulsar un botón
-- (sugerencias del Centro de Control, mensajes a alumnas al aprobarlas y
-- automatizaciones). Lo escribe /api/estudio/redaccion-ia (solo propietaria) y
-- lo lee dbRedaccionIaActiva, que falla cerrado. Mismo patrón que
-- 20260810222838 (RESUMEN_SEMANAL): sin esto, guardar el «apagado» fallaría.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.decision_feature_flags
  drop constraint if exists decision_feature_flags_flag_check;

alter table public.decision_feature_flags
  add constraint decision_feature_flags_flag_check
  check (flag in
    ('DECISIONES','RETENCION','INGRESOS','FINANZAS','AGENDA','MARKETING','EQUIPO','CAPTACION','ONBOARDING','RESUMEN_SEMANAL','REDACCION_IA'));
