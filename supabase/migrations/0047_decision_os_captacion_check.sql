-- 0047_decision_os_captacion_check.sql
-- El especialista CAPTACION (lib/decision/especialistas/captacion.ts) emite
-- recomendaciones (CONTACTAR_LEAD, CONVERTIR_PRUEBA) y se siembra en
-- app/api/decisiones/route.ts, pero el CHECK original de
-- recomendaciones.especialista (0003_decision_os.sql) omitía 'CAPTACION',
-- por lo que persistir esas recomendaciones vía dbUpsertRecomendacion violaba
-- el constraint en runtime. Fix aditivo: ampliar la lista permitida.

ALTER TABLE public.recomendaciones
  DROP CONSTRAINT IF EXISTS recomendaciones_especialista_check;

ALTER TABLE public.recomendaciones
  ADD CONSTRAINT recomendaciones_especialista_check
  CHECK (especialista IN
    ('RETENCION','INGRESOS','AGENDA','MARKETING','FINANZAS','EQUIPO','CAPTACION'));
