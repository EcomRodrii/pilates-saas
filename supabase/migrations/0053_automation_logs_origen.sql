-- ═══════════════════════════════════════════════════════════════════════════
-- S-2 · automation_logs: separar el origen polimórfico en dos columnas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
-- `automation_logs.rule_id` tenía una FK a `automation_rules(id)`, pero la
-- columna se usaba de forma POLIMÓRFICA por diseño: el camino de reglas escribe
-- ahí el id de una `automation_rule`, y el de marketing (procesarCandidatoMkt)
-- el id de una `automatizacion` (`auto-*`). Una FK sobre una columna polimórfica
-- es incorrecta por construcción: no hay dato que la satisfaga desde el segundo
-- camino, así que TODOS esos inserts fallaban.
--
-- IMPACTO MEDIDO ANTES DE ESTA MIGRACIÓN
--   · automation_logs: 32 filas, de las cuales 0 de marketing (`id like 'mkt-%'`)
--   · automatizaciones: 5, con ejecuciones registradas — pero sin un solo log
-- El log de marketing no es solo traza: es el mecanismo de DEDUPLICACIÓN
-- (`yaEnviado` en marketing-automation-engine.ts lee automation_logs). Sin log
-- persistido el dedup nunca ve un envío previo, así que el cron diario reenviaba
-- el mismo mensaje a la misma socia cada día — incluidos los triggers pensados
-- para enviarse UNA sola vez (NUEVA_ALTA, PRIMERA_CLASE, SUSCRIPCION_CANCELADA,
-- con ventana de 3650 días). El email lleva idempotency-key, pero incluye la
-- fecha, así que no protege entre días; WhatsApp no lleva ninguna.
--
-- DISEÑO
-- Dos columnas nullable, cada una con su propia FK, y un CHECK de que va
-- informada EXACTAMENTE una. Así el origen queda tipado en la BD en vez de
-- depender del prefijo del id.
--
-- `automatizacion_id` va con ON DELETE CASCADE a propósito: la app borra
-- automatizaciones (`dbDeleteAutomatizacion`), y con NO ACTION ese borrado
-- fallaría en cuanto la automatización tuviera un log. `rule_id` conserva su
-- semántica actual (NO ACTION) para no cambiar comportamiento existente.
--
-- Reversible: DROP COLUMN automatizacion_id + restaurar la FK anterior.
-- Reejecutable: todo va con IF EXISTS / IF NOT EXISTS.

BEGIN;

ALTER TABLE public.automation_logs
  ADD COLUMN IF NOT EXISTS automatizacion_id text;

-- La FK vieja se sustituye por la misma FK (mismas columnas y semántica): se
-- recrea para dejar el estado explícito y que la migración sea reejecutable.
ALTER TABLE public.automation_logs
  DROP CONSTRAINT IF EXISTS automation_logs_rule_id_fkey;
ALTER TABLE public.automation_logs
  ADD CONSTRAINT automation_logs_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id);

ALTER TABLE public.automation_logs
  DROP CONSTRAINT IF EXISTS automation_logs_automatizacion_id_fkey;
ALTER TABLE public.automation_logs
  ADD CONSTRAINT automation_logs_automatizacion_id_fkey
  FOREIGN KEY (automatizacion_id) REFERENCES public.automatizaciones(id) ON DELETE CASCADE;

-- Exactamente una de las dos. Las 32 filas existentes tienen rule_id informado
-- y automatizacion_id NULL, así que la validación pasa sin backfill.
ALTER TABLE public.automation_logs
  DROP CONSTRAINT IF EXISTS automation_logs_origen_check;
ALTER TABLE public.automation_logs
  ADD CONSTRAINT automation_logs_origen_check
  CHECK ((rule_id IS NOT NULL) <> (automatizacion_id IS NOT NULL));

-- El dedup de marketing busca por (automatizacion_id, socio_id).
CREATE INDEX IF NOT EXISTS idx_automation_logs_automatizacion
  ON public.automation_logs (automatizacion_id, socio_id);

COMMIT;
