-- Las clases impartidas entran en la liquidación.
--
-- `studio_config_tiempo.pagar_duracion_real`: opción del estudio. Por defecto
-- (false) cada clase dada se paga por su horario, y lo que empezó tarde o acabó
-- antes solo se enseña. Con true se paga lo que duró de verdad. La cambia solo la
-- propietaria, desde el servidor (la tabla no tiene escritura desde el cliente).
--
-- En cada liquidación queda con qué se calculó, para que un documento confirmado
-- se lea igual aunque luego cambien la relación o las clases:
--   · relacion_laboral: la de la instructora al generarla (autónoma = por clases).
--   · clases_sin_confirmar: se pagan por su horario, pero no dejan confirmar.
--   · clases_no_dadas: ella dijo que no las dio; no se pagan.
--   · minutos_retraso: lo que empezó tarde en las clases dadas.
--   · minutos_contrato / minutos_extra: contratada con horas de contrato; lo
--     fichado por encima se enseña y no se paga aparte.

ALTER TABLE public.studio_config_tiempo
  ADD COLUMN IF NOT EXISTS pagar_duracion_real boolean NOT NULL DEFAULT false;

ALTER TABLE public.liquidaciones_instructoras
  ADD COLUMN IF NOT EXISTS relacion_laboral text
    CHECK (relacion_laboral IS NULL OR relacion_laboral IN ('CONTRATADA', 'AUTONOMA')),
  ADD COLUMN IF NOT EXISTS clases_sin_confirmar integer NOT NULL DEFAULT 0
    CHECK (clases_sin_confirmar >= 0),
  ADD COLUMN IF NOT EXISTS clases_no_dadas integer NOT NULL DEFAULT 0
    CHECK (clases_no_dadas >= 0),
  ADD COLUMN IF NOT EXISTS minutos_retraso integer NOT NULL DEFAULT 0
    CHECK (minutos_retraso >= 0),
  ADD COLUMN IF NOT EXISTS minutos_contrato integer
    CHECK (minutos_contrato IS NULL OR minutos_contrato >= 0),
  ADD COLUMN IF NOT EXISTS minutos_extra integer
    CHECK (minutos_extra IS NULL OR minutos_extra >= 0);
