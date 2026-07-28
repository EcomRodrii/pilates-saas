-- Índices para dos hallazgos del audit de rendimiento de base de datos:
--
-- 1) current_studio_id() (STABLE, usada por las RLS de reservas/socios/recibos/
--    facturas/sesiones/automation_logs/...) consulta instructores.auth_user_id y
--    studios.owner_auth_user_id sin índice — hoy es gratis (8 y 13 filas en prod),
--    pero es la única tabla (studios) cuyo crecimiento es 1:1 con el nº de
--    estudios del SaaS, no del tenant. Se ejecuta en casi cada request
--    autenticado, así que es el índice de mayor apalancamiento de todo el
--    sistema aunque hoy no mida nada.
--
-- 2) automation_logs: el patrón real de lectura (dashboard + fetchAllStudioData)
--    es WHERE studio_id=$1 ORDER BY ejecutado_en DESC. Sin un índice que lo
--    cubra, cada llamada fuerza un sort (confirmado en pg_stat_statements:
--    672 llamadas, media 7.76ms, máx 60.3ms con solo 90 filas).
CREATE INDEX IF NOT EXISTS idx_instructores_auth_user_id ON public.instructores (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_studios_owner_auth_user_id ON public.studios (owner_auth_user_id);

CREATE INDEX IF NOT EXISTS idx_automation_logs_studio_ejecutado
  ON public.automation_logs (studio_id, ejecutado_en DESC);
