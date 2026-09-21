-- Control horario de instructoras: jornadas (entrada → salida), su auditoría y
-- la configuración por estudio.
--
-- Las ESCRITURAS solo las hace el servidor (service_role) desde
-- /api/portal/instructora/fichaje y /api/equipo/jornadas: una instructora con
-- INSERT/UPDATE directo podría inventarse sus horas y saltarse la auditoría. Al
-- cliente autenticado solo le queda SELECT.

CREATE TABLE IF NOT EXISTS public.instructor_work_sessions (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  instructor_id text NOT NULL REFERENCES public.instructores(id) ON DELETE CASCADE,
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz,
  check_in_method text NOT NULL DEFAULT 'MOBILE'
    CHECK (check_in_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),
  check_out_method text
    CHECK (check_out_method IS NULL OR check_out_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'PENDING_REVIEW')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  edited_at timestamptz,
  edited_by uuid,
  CONSTRAINT work_sessions_estado_coherente CHECK (
    (status = 'OPEN' AND check_out_at IS NULL)
    OR (status <> 'OPEN' AND check_out_at IS NOT NULL AND check_out_at > check_in_at)
  )
);

-- Una sola jornada abierta por instructora y estudio. Es un ÍNDICE único
-- parcial: `UNIQUE (...) WHERE ...` no es sintaxis válida como constraint.
CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_una_abierta
  ON public.instructor_work_sessions (studio_id, instructor_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_work_sessions_instructor
  ON public.instructor_work_sessions (studio_id, instructor_id, check_in_at DESC);

ALTER TABLE public.instructor_work_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_sessions_select ON public.instructor_work_sessions
  FOR SELECT TO authenticated
  USING (
    studio_id = current_studio_id()
    AND (instructor_id = current_instructor_id() OR public.puede_gestionar_equipo())
  );

REVOKE ALL ON public.instructor_work_sessions FROM anon, authenticated;
GRANT SELECT ON public.instructor_work_sessions TO authenticated;
GRANT ALL ON public.instructor_work_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.work_session_audits (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  work_session_id text NOT NULL REFERENCES public.instructor_work_sessions(id) ON DELETE CASCADE,
  action text NOT NULL
    CHECK (action IN ('CHECK_IN', 'CHECK_OUT', 'EDITED')),
  field_name text,
  value_before text,
  value_after text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_session_audits_work_session
  ON public.work_session_audits (work_session_id, created_at DESC);

ALTER TABLE public.work_session_audits ENABLE ROW LEVEL SECURITY;

-- Solo quien gestiona el equipo ve la auditoría (incluye quién editó y por qué).
CREATE POLICY work_session_audits_select ON public.work_session_audits
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo());

REVOKE ALL ON public.work_session_audits FROM anon, authenticated;
GRANT SELECT ON public.work_session_audits TO authenticated;
GRANT ALL ON public.work_session_audits TO service_role;

CREATE TABLE IF NOT EXISTS public.studio_config_tiempo (
  studio_id text PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,
  -- Minutos antes de una clase en los que la app recuerda fichar.
  check_in_window_minutes integer NOT NULL DEFAULT 10
    CHECK (check_in_window_minutes BETWEEN 0 AND 120),
  -- Pasadas estas horas, la jornada abierta se marca «requiere revisión».
  open_session_limit_hours integer NOT NULL DEFAULT 12
    CHECK (open_session_limit_hours BETWEEN 1 AND 24),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_config_tiempo ENABLE ROW LEVEL SECURITY;

CREATE POLICY config_tiempo_select ON public.studio_config_tiempo
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

CREATE POLICY config_tiempo_write ON public.studio_config_tiempo
  FOR ALL TO authenticated
  USING (studio_id = current_studio_id() AND public.current_rol() = 'PROPIETARIO')
  WITH CHECK (studio_id = current_studio_id() AND public.current_rol() = 'PROPIETARIO');

REVOKE ALL ON public.studio_config_tiempo FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.studio_config_tiempo TO authenticated;
GRANT ALL ON public.studio_config_tiempo TO service_role;
