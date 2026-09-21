-- ─────────────────────────────────────────────────────────────────────────────
-- Opening OS · apertura suave.
--
-- Con el interruptor puesto, las clases ANTERIORES a studios.fecha_apertura solo
-- las reserva el grupo de la apertura suave (compradoras de un plan de etapa de
-- lanzamiento + socias con la etiqueta 'apertura-suave'). Es una regla por
-- fecha, no un estado: el día oficial se abre a todas sin cron ni nadie que lo
-- cambie. La aplica el servidor (crearReservaPublica y checkout-embebido); el
-- mostrador se la salta.
--
-- Default false = comportamiento de hoy. Solo la escribe /api/opening con
-- service-role: studios usa grants por COLUMNA para authenticated y aquí no se
-- concede ninguno (verificado con has_column_privilege tras aplicar).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.studios add column if not exists apertura_suave boolean not null default false;
