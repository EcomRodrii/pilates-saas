-- Elimina las reglas con trigger 'SUSCRIPCION_EXPIRA_DIAS', que no existe.
--
-- Ese trigger se declaró en el enum TriggerRule pero NUNCA se implementó en
-- lib/engines/automation-engine.ts. Se quitó del tipo en 2bb9e6d (PR #219,
-- 21 jul 2026) porque duplicaba SUSCRIPCION_EXPIRA_7D/1D del motor de
-- marketing, que además deja que el estudio escriba el texto. Pero la fila de
-- datos se quedó: automation_rules.trigger es `text` libre (0000_base.sql:364),
-- sin CHECK ni enum, y el mapper la deja entrar con un `as` sin validar.
--
-- Efecto de dejarla: el forEach del motor la itera, ninguna rama coincide, y no
-- genera candidatos. La propietaria ve una regla que puede encender y que no
-- hace nada, sin error ni aviso. Encima la UI mostraba el trigger crudo porque
-- tampoco estaba en triggerLabels.
--
-- La funcionalidad que prometía ("avisa y cobra la renovación") ya está cubierta
-- de punta a punta: aviso pre-expiración con SUSCRIPCION_EXPIRA_7D/1D
-- (lib/engines/marketing-automation-engine.ts:125-130), generación del recibo en
-- lib/inngest/renovaciones.ts (cron 08:00), cobro en lib/inngest/dunning.ts
-- (08:30) y confirmación con RENOVACION_COBRADA. Reimplementarla sería duplicar
-- cobros: su paso COBRAR_RECIBO con condicion SIEMPRE chocaría con los recibos
-- de renovaciones.ts, cuya deduplicación no conoce este motor.
--
-- En producción: 1 fila (rule-3, studio-1, desactivada) y 2 logs, todo del seed
-- de demo — su ejecutada_veces=22 es un número inventado en supabase/seed.sql,
-- no ejecuciones reales (el contador sólo sube cuando la regla genera
-- candidatos, y esta nunca pudo). La fila del seed se borra en el mismo commit.

-- Primero los logs: automation_logs.rule_id tiene FK a automation_rules(id)
-- (0053_automation_logs_origen.sql).
delete from public.automation_logs
where rule_id in (
  select id from public.automation_rules where trigger = 'SUSCRIPCION_EXPIRA_DIAS'
);

delete from public.automation_rules
where trigger = 'SUSCRIPCION_EXPIRA_DIAS';
