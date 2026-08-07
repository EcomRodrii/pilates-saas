-- Outcome cuantificado (€/tiempo) — Pilar 3 de "Tentare 2030": medir el
-- RESULTADO de una automatización, no solo si se siguió. `impacto_real` usa la
-- misma forma que `recomendaciones.impacto` (jsonb {valor, unidad, formula}) en
-- vez de un segundo esquema para el mismo concepto. `confianza_medicion`
-- distingue "cero de verdad" (se comprobó y no hubo dinero) de "no lo sabemos"
-- (el tipo de recomendación no tiene una señal financiera limpia que atribuirle)
-- — sin este flag, un AVG(impacto_real) mezclaría ambos casos como si fueran lo
-- mismo. Ambas columnas NULL por defecto: sin backfill histórico, coherente con
-- "el sistema arranca frío por diseño" (0003_decision_os.sql).
ALTER TABLE public.recomendacion_outcomes
  ADD COLUMN impacto_real jsonb,
  ADD COLUMN confianza_medicion text CHECK (confianza_medicion IN ('MEDIDO', 'NO_MEDIBLE'));

COMMENT ON COLUMN public.recomendacion_outcomes.impacto_real IS
  'Resultado cuantificado real (no estimado), misma forma que recomendaciones.impacto. NULL si confianza_medicion es NO_MEDIBLE o aún no se ha medido.';
COMMENT ON COLUMN public.recomendacion_outcomes.confianza_medicion IS
  'MEDIDO = impacto_real es una cifra con respaldo real (dinero cobrado, plan renovado). NO_MEDIBLE = este tipo/resultado no tiene una señal financiera limpia que atribuirle, no se inventa un número.';
