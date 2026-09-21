-- Agregar vigencia temporal a instructor_tarifas (backward compatible)
-- Permite histórico de tarifas sin cambiar PK existente ni romper queries actuales

ALTER TABLE public.instructor_tarifas
  ADD COLUMN IF NOT EXISTS vigente_desde date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE public.instructor_tarifas
  ADD COLUMN IF NOT EXISTS vigente_hasta date;

-- Constraint: no solapamientos
ALTER TABLE public.instructor_tarifas
  ADD CONSTRAINT instructor_tarifas_no_overlap CHECK (
    vigente_hasta IS NULL OR vigente_hasta >= vigente_desde
  );

-- Índice para consultas rápidas de tarifa vigente en una fecha
CREATE INDEX IF NOT EXISTS idx_instructor_tarifas_vigente
  ON public.instructor_tarifas (instructor_id, studio_id)
  WHERE vigente_hasta IS NULL;

-- Índice para histórico por rango de fechas
CREATE INDEX IF NOT EXISTS idx_instructor_tarifas_rango
  ON public.instructor_tarifas (instructor_id, studio_id, vigente_desde, vigente_hasta);

-- RPC: obtener tarifa vigente en una fecha específica
CREATE OR REPLACE FUNCTION public.get_instructor_tarifa_vigente(
  p_instructor_id text,
  p_studio_id text,
  p_en_fecha date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  tarifa_hora numeric,
  base_mensual_eur numeric,
  recargo_sustitucion_pct numeric,
  vigente_desde date,
  vigente_hasta date,
  actualizado_por uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.tarifa_hora, t.base_mensual_eur, t.recargo_sustitucion_pct,
         t.vigente_desde, t.vigente_hasta, t.actualizado_por
  FROM instructor_tarifas t
  WHERE t.instructor_id = p_instructor_id
    AND t.studio_id = p_studio_id
    AND t.vigente_desde <= p_en_fecha
    AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= p_en_fecha)
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instructor_tarifa_vigente(text, text, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_instructor_tarifa_vigente(text, text, date) IS
  'Obtiene la tarifa vigente de una instructora en una fecha específica. Respeta el histórico si existen múltiples filas.';
