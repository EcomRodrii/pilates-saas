-- Control Horario Inteligente de Instructoras
-- FASE 1: Tablas de jornadas de trabajo, sesiones vinculadas, auditoría, configuración

--
-- Table: instructor_work_sessions (Jornada de trabajo)
-- Una jornada es un período continuo entrada→salida.
-- Máximo una jornada OPEN por instructora simultáneamente.
--

CREATE TABLE IF NOT EXISTS public.instructor_work_sessions (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  instructor_id text NOT NULL REFERENCES public.instructores(id) ON DELETE CASCADE,

  -- Timestamps de entrada/salida (ambos nullable para estados intermedios)
  check_in_at timestamptz,          -- NULL = sin registrar
  check_out_at timestamptz,         -- NULL = sin registrar

  -- Método de fichaje (extensible: MOBILE, QR, KIOSK, API)
  check_in_method text NOT NULL DEFAULT 'MOBILE'
    CHECK (check_in_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),
  check_out_method text
    CHECK (check_out_method IS NULL OR check_out_method IN ('MOBILE', 'QR', 'KIOSK', 'API')),

  -- Estado persistido SÓLO: OPEN, CLOSED, PENDING_REVIEW
  -- MISSING_CHECK_IN / MISSING_CHECK_OUT son derivados de presentación
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'PENDING_REVIEW')),

  -- Auditoría de creación
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,  -- auth_user_id de quién creó

  -- Auditoría de edición
  edited_at timestamptz,
  edited_by uuid,

  -- Constraints
  CONSTRAINT work_sessions_timestamps_valid CHECK (
    (check_in_at IS NULL AND check_out_at IS NULL) OR
    (check_in_at IS NOT NULL AND check_out_at IS NULL) OR  -- OPEN
    (check_in_at IS NOT NULL AND check_out_at IS NOT NULL AND check_out_at > check_in_at)  -- CLOSED
  ),

  -- Máximo una jornada OPEN por instructora (permite múltiples CLOSED el mismo día)
  CONSTRAINT work_sessions_one_open_per_instructor UNIQUE (studio_id, instructor_id) WHERE (status = 'OPEN')
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_instructor
  ON public.instructor_work_sessions (studio_id, instructor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status
  ON public.instructor_work_sessions (studio_id, status, check_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_range
  ON public.instructor_work_sessions (studio_id, instructor_id, check_in_at, check_out_at);

ALTER TABLE public.instructor_work_sessions ENABLE ROW LEVEL SECURITY;

--
-- RLS Policies: instructor_work_sessions
--

-- INSTRUCTORA: ver/crear/editar SÓLO sus propias jornadas
CREATE POLICY work_sessions_self_select ON public.instructor_work_sessions
  FOR SELECT TO authenticated
  USING (
    (instructor_id = current_instructor_id() AND studio_id = current_studio_id())
    OR (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  );

-- INSTRUCTORA: registrar entrada (crear jornada OPEN)
CREATE POLICY work_sessions_self_insert ON public.instructor_work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
  );

-- INSTRUCTORA: actualizar SÓLO su jornada OPEN (check-out)
CREATE POLICY work_sessions_self_update ON public.instructor_work_sessions
  FOR UPDATE TO authenticated
  USING (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
    AND status = 'OPEN'
  )
  WITH CHECK (
    instructor_id = current_instructor_id()
    AND studio_id = current_studio_id()
  );

-- PROPIETARIO/MANAGER: CRUD total + correcciones manuales
CREATE POLICY work_sessions_admin ON public.instructor_work_sessions
  FOR ALL TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  WITH CHECK (studio_id = current_studio_id() AND public.puede_gestionar_equipo());

GRANT SELECT, INSERT, UPDATE ON public.instructor_work_sessions TO authenticated, service_role;

--
-- Table: work_session_sessions (Sesiones vinculadas a jornada)
-- N:M: sesiones que ocurren DENTRO de una jornada (vinculación manual, no automática)
--

CREATE TABLE IF NOT EXISTS public.work_session_sessions (
  id text PRIMARY KEY,
  work_session_id text NOT NULL REFERENCES public.instructor_work_sessions(id) ON DELETE CASCADE,
  sesion_id text NOT NULL REFERENCES public.sesiones(id) ON DELETE CASCADE,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Auditoría
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid NOT NULL,

  -- Una sesión vinculada sólo una vez a una jornada
  UNIQUE(work_session_id, sesion_id)
);

CREATE INDEX IF NOT EXISTS idx_work_session_sessions_sesion
  ON public.work_session_sessions (sesion_id);
CREATE INDEX IF NOT EXISTS idx_work_session_sessions_work_session
  ON public.work_session_sessions (work_session_id);

ALTER TABLE public.work_session_sessions ENABLE ROW LEVEL SECURITY;

-- LECTURA: equipo del estudio
CREATE POLICY work_session_sessions_select ON public.work_session_sessions
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

-- ESCRITURA: SÓLO PROPIETARIO/MANAGER
CREATE POLICY work_session_sessions_write ON public.work_session_sessions
  FOR ALL TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo())
  WITH CHECK (studio_id = current_studio_id() AND public.puede_gestionar_equipo());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_session_sessions TO authenticated, service_role;

--
-- Table: work_session_audits (Auditoría de cambios)
-- Registra quién cambió qué y cuándo en una jornada
--

CREATE TABLE IF NOT EXISTS public.work_session_audits (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  work_session_id text NOT NULL REFERENCES public.instructor_work_sessions(id) ON DELETE CASCADE,

  action text NOT NULL
    CHECK (action IN ('CREATED', 'CHECK_IN', 'CHECK_OUT', 'EDITED', 'DELETED', 'STATUS_CHANGED')),

  -- Cambio de valores
  field_name text,  -- 'check_in_at', 'check_out_at', 'status', 'check_in_method', etc.
  value_before text,
  value_after text,

  -- Metadatos de cambio
  reason text,  -- opcional: por qué se editó

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_session_audits_work_session
  ON public.work_session_audits (work_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_session_audits_studio
  ON public.work_session_audits (studio_id, created_at DESC);

ALTER TABLE public.work_session_audits ENABLE ROW LEVEL SECURITY;

-- LECTURA: equipo + instructora su propia jornada
CREATE POLICY work_session_audits_select ON public.work_session_audits
  FOR SELECT TO authenticated
  USING (
    studio_id = current_studio_id()
    AND (
      public.puede_gestionar_equipo()
      OR work_session_id IN (
        SELECT id FROM instructor_work_sessions
        WHERE instructor_id = current_instructor_id()
      )
    )
  );

-- ESCRITURA: system only (via server action, NO manual)
GRANT SELECT ON public.work_session_audits TO authenticated, service_role;

--
-- Table: studio_config_tiempo (Configuración por estudio)
--

CREATE TABLE IF NOT EXISTS public.studio_config_tiempo (
  studio_id text PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,

  -- Ventana de fichaje: minutos antes de clase que se permite check-in
  check_in_window_minutes integer NOT NULL DEFAULT 10
    CHECK (check_in_window_minutes BETWEEN 0 AND 120),

  -- Límite de jornada abierta antes de marcar "requiere revisión" (horas)
  open_session_limit_hours integer NOT NULL DEFAULT 12
    CHECK (open_session_limit_hours BETWEEN 1 AND 24),

  -- Permitir check-in retroactivo (edición manual de timestamps)
  allow_retroactive_check_in boolean NOT NULL DEFAULT false,

  -- Permitir edición de jornadas cerradas
  allow_edit_closed_sessions boolean NOT NULL DEFAULT false,

  -- Métodos de fichaje habilitados
  metodos_habilitados text[] NOT NULL DEFAULT '{"MOBILE","QR","KIOSK"}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_config_tiempo ENABLE ROW LEVEL SECURITY;

-- LECTURA: equipo del estudio
CREATE POLICY config_tiempo_select ON public.studio_config_tiempo
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id());

-- ESCRITURA: SÓLO PROPIETARIO
CREATE POLICY config_tiempo_write ON public.studio_config_tiempo
  FOR ALL TO authenticated
  USING (
    studio_id = current_studio_id()
    AND public.current_rol() = 'PROPIETARIO'
  )
  WITH CHECK (
    studio_id = current_studio_id()
    AND public.current_rol() = 'PROPIETARIO'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_config_tiempo TO authenticated, service_role;

-- Crear configuración por defecto para estudios existentes
INSERT INTO public.studio_config_tiempo (studio_id)
  SELECT id FROM public.studios
  ON CONFLICT DO NOTHING;
