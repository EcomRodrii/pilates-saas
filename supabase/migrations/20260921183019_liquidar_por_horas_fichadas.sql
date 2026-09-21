-- Liquidación por horas fichadas, opcional por estudio.
--
-- `studio_config_tiempo.liquidar_por`: con qué se calcula la parte variable de la
-- liquidación de instructoras. 'CLASES' (por defecto, lo de siempre) = horas de
-- clase × tarifa; 'HORAS_FICHADAS' = horas de jornadas cerradas × tarifa. Lo
-- cambia solo la propietaria, desde el servidor (la tabla no tiene escritura
-- desde el cliente).
--
-- En cada liquidación queda con qué criterio se calculó (`modo`), cuánto se fichó
-- y cuántas jornadas del mes seguían sin cerrar: un documento confirmado tiene que
-- poder leerse igual aunque el estudio cambie de criterio después.

ALTER TABLE public.studio_config_tiempo
  ADD COLUMN IF NOT EXISTS liquidar_por text NOT NULL DEFAULT 'CLASES'
    CHECK (liquidar_por IN ('CLASES', 'HORAS_FICHADAS'));

ALTER TABLE public.liquidaciones_instructoras
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'CLASES'
    CHECK (modo IN ('CLASES', 'HORAS_FICHADAS')),
  ADD COLUMN IF NOT EXISTS minutos_fichados integer
    CHECK (minutos_fichados IS NULL OR minutos_fichados >= 0),
  ADD COLUMN IF NOT EXISTS jornadas_sin_cerrar integer NOT NULL DEFAULT 0
    CHECK (jornadas_sin_cerrar >= 0);
