-- Funciones RPC auxiliares para control horario

--
-- RPC: Obtener sesiones compatibles para vincular a jornada
-- Detecta sesiones que ocurren dentro del rango de una jornada
--

CREATE OR REPLACE FUNCTION public.get_compatible_sessions(
  p_work_session_id text,
  p_studio_id text
)
RETURNS TABLE (
  sesion_id text,
  instructor_id text,
  tipo_clase_id text,
  sala_id text,
  inicio timestamptz,
  fin timestamptz,
  duracion_horas numeric,
  ya_vinculada boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_instructor_id text;
BEGIN
  -- Obtener jornada
  SELECT check_in_at, check_out_at, instructor_id
  INTO v_check_in, v_check_out, v_instructor_id
  FROM instructor_work_sessions
  WHERE id = p_work_session_id AND studio_id = p_studio_id;

  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'Jornada sin check_in registrado';
  END IF;

  -- Retornar sesiones compatibles (dentro del rango check_in/check_out)
  RETURN QUERY
  SELECT
    s.id,
    s.instructor_id,
    s.tipo_clase_id,
    s.sala_id,
    s.inicio,
    s.fin,
    EXTRACT(EPOCH FROM (s.fin - s.inicio))::numeric / 3600,
    EXISTS(
      SELECT 1 FROM work_session_sessions
      WHERE work_session_id = p_work_session_id AND sesion_id = s.id
    )
  FROM sesiones s
  WHERE s.studio_id = p_studio_id
    AND s.instructor_id = v_instructor_id
    AND s.inicio >= v_check_in
    AND s.fin <= COALESCE(v_check_out, 'infinity'::timestamptz)
    AND NOT s.cancelada
  ORDER BY s.inicio;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compatible_sessions(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_compatible_sessions(text, text) IS
  'Retorna sesiones compatibles con una jornada (dentro del rango check_in/check_out). Ya vinculadas se marcan. Permite vinculación manual segura.';

--
-- RPC: Obtener jornada abierta de instructora (si existe)
--

CREATE OR REPLACE FUNCTION public.get_instructor_open_session(
  p_instructor_id text,
  p_studio_id text
)
RETURNS TABLE (
  id text,
  check_in_at timestamptz,
  check_in_method text,
  status text,
  duracion_minutos integer,
  requiere_revision boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_limit_hours integer;
BEGIN
  -- Obtener límite de horas de la configuración
  SELECT config.open_session_limit_hours INTO v_open_limit_hours
  FROM studio_config_tiempo config
  WHERE config.studio_id = p_studio_id;

  v_open_limit_hours := COALESCE(v_open_limit_hours, 12);

  -- Retornar jornada abierta (máximo 1)
  RETURN QUERY
  SELECT
    ws.id,
    ws.check_in_at,
    ws.check_in_method,
    ws.status,
    EXTRACT(EPOCH FROM (now() - ws.check_in_at))::integer / 60,
    (EXTRACT(EPOCH FROM (now() - ws.check_in_at))::integer / 60 / 60) > v_open_limit_hours
  FROM instructor_work_sessions ws
  WHERE ws.instructor_id = p_instructor_id
    AND ws.studio_id = p_studio_id
    AND ws.status = 'OPEN'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_instructor_open_session(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_instructor_open_session(text, text) IS
  'Obtiene la jornada abierta actual de una instructora (máximo 1). Incluye duración transcurrida y si requiere revisión por exceso de duración.';

--
-- RPC: Obtener métricas de jornada (horas, clases, costo)
-- Derivadas de los datos, no persistidas
--

CREATE OR REPLACE FUNCTION public.calculate_work_session_metrics(
  p_work_session_id text,
  p_studio_id text
)
RETURNS TABLE (
  duracion_jornada_horas numeric,
  duracion_clases_horas numeric,
  num_clases integer,
  tarifa_hora numeric,
  costo_estimado numeric,
  estado_derivado text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in timestamptz;
  v_check_out timestamptz;
  v_instructor_id text;
  v_duracion_jornada numeric;
  v_duracion_clases numeric;
  v_num_clases integer;
  v_tarifa_hora numeric;
BEGIN
  -- Obtener jornada
  SELECT ws.check_in_at, ws.check_out_at, ws.instructor_id
  INTO v_check_in, v_check_out, v_instructor_id
  FROM instructor_work_sessions ws
  WHERE ws.id = p_work_session_id AND ws.studio_id = p_studio_id;

  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'Jornada no encontrada';
  END IF;

  -- Duración de jornada (si check_out existe)
  IF v_check_out IS NOT NULL THEN
    v_duracion_jornada := EXTRACT(EPOCH FROM (v_check_out - v_check_in))::numeric / 3600;
  ELSE
    v_duracion_jornada := NULL;
  END IF;

  -- Duración de clases vinculadas
  SELECT
    COALESCE(SUM(EXTRACT(EPOCH FROM (s.fin - s.inicio))::numeric / 3600), 0),
    COUNT(DISTINCT s.id)
  INTO v_duracion_clases, v_num_clases
  FROM work_session_sessions wss
  JOIN sesiones s ON s.id = wss.sesion_id
  WHERE wss.work_session_id = p_work_session_id;

  -- Tarifa vigente (en fecha de check_in)
  SELECT t.tarifa_hora INTO v_tarifa_hora
  FROM get_instructor_tarifa_vigente(v_instructor_id, p_studio_id, DATE(v_check_in));

  -- Retornar métricas
  RETURN QUERY
  SELECT
    v_duracion_jornada,
    v_duracion_clases,
    v_num_clases,
    v_tarifa_hora,
    CASE WHEN v_duracion_jornada IS NOT NULL AND v_tarifa_hora IS NOT NULL
      THEN v_duracion_jornada * v_tarifa_hora
      ELSE NULL
    END,
    CASE
      WHEN v_check_out IS NULL AND (EXTRACT(EPOCH FROM (now() - v_check_in))::numeric / 3600) >
        (SELECT COALESCE(config.open_session_limit_hours, 12) FROM studio_config_tiempo config WHERE config.studio_id = p_studio_id)
      THEN 'REQUIRES_REVIEW'
      WHEN v_check_out IS NOT NULL THEN 'COMPLETED'
      ELSE 'OPEN'
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_work_session_metrics(text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.calculate_work_session_metrics(text, text) IS
  'Calcula métricas derivadas de una jornada: duración, clases, coste. Todo calculado, no persistido.';
