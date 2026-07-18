-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 · TENTARE — Módulo de sustituciones (wedge sobre el Tentare existente)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- OBJETIVO
-- "Cuando una instructora falla, el sistema encuentra a otra antes de que la
--  propietaria tenga que coger el teléfono." Este módulo se construye SOBRE las
--  tablas ya en producción (sesiones, instructores, socios, reservas, studios):
--  NO duplica clases ni alumnas. Solo añade lo que hoy no existe.
--
-- QUÉ SE REUTILIZA (no se toca aquí)
-- - Clase programada .......... `sesiones` (instructor en instructor_id,
--                               tipo en tipo_clase_id, ventana inicio/fin tstz)
-- - Instructora ............... `instructores`
-- - Alumna / inscripción ...... `socios` + `reservas` (socio_id + sesion_id)
-- - "Ya conoce esta clase" .... derivado de sesiones.instructor_id (no tabla)
-- - "Horas este mes" .......... derivado de sesiones (no contador mutable)
--
-- QUÉ SE CREA AQUÍ (lo que hoy no existe)
-- - `sustituciones` ................... el proceso baja→sustituta (state machine)
-- - `sustitucion_contactos` ........... cada intento de contacto + token firmado
-- - `instructora_disponibilidad` ...... ventanas semanales de trabajo
-- - `instructora_disponibilidad_excepciones` .. bloqueos/extras de fecha concreta
-- + funciones de solo lectura que derivan datos reales (sin contadores mutables):
--   alumnas_apuntadas(), instructor_horas_mes(), instructor_tiene_conflicto()
--
-- DECISIONES (derivar de datos reales, cero columnas nuevas en `instructores`)
-- - "Especialidad" del scoring = ¿ya ha impartido ese tipo_clase? (histórico real)
-- - "Pocas horas este mes" = ranking relativo por horas ya impartidas este mes.
--
-- RLS por estudio (misma política que 0018). El flujo servidor (cron + endpoints
-- de token) corre con service-role; el panel lee con la sesión del estudio.
--
-- Reversible: DROP de las 4 tablas + 3 funciones (additivo, no altera nada previo).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · DISPONIBILIDAD SEMANAL de instructoras (ventanas recurrentes)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructora_disponibilidad (
  id text NOT NULL,
  studio_id text NOT NULL,
  instructor_id text NOT NULL,
  dia_semana integer NOT NULL,           -- 0=domingo .. 6=sábado
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT instructora_disponibilidad_pkey PRIMARY KEY (id),
  CONSTRAINT instructora_disponibilidad_dia_check CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT instructora_disponibilidad_rango_check CHECK (hora_fin > hora_inicio)
);

ALTER TABLE ONLY public.instructora_disponibilidad
  ADD CONSTRAINT instructora_disponibilidad_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.instructora_disponibilidad
  ADD CONSTRAINT instructora_disponibilidad_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_disponibilidad_instructor
  ON public.instructora_disponibilidad USING btree (instructor_id, dia_semana);

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · EXCEPCIONES de disponibilidad ("este martes concreto no puedo" / extra)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instructora_disponibilidad_excepciones (
  id text NOT NULL,
  studio_id text NOT NULL,
  instructor_id text NOT NULL,
  fecha date NOT NULL,
  hora_inicio time,                      -- NULL = todo el día
  hora_fin time,
  tipo text NOT NULL,                    -- 'bloqueo' | 'extra'
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT instructora_disp_exc_pkey PRIMARY KEY (id),
  CONSTRAINT instructora_disp_exc_tipo_check CHECK (tipo IN ('bloqueo', 'extra'))
);

ALTER TABLE ONLY public.instructora_disponibilidad_excepciones
  ADD CONSTRAINT instructora_disp_exc_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.instructora_disponibilidad_excepciones
  ADD CONSTRAINT instructora_disp_exc_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_disp_exc_instructor_fecha
  ON public.instructora_disponibilidad_excepciones USING btree (instructor_id, fecha);

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · SUSTITUCIONES (la máquina de estados baja→sustituta)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sustituciones (
  id text NOT NULL,
  studio_id text NOT NULL,
  sesion_id text NOT NULL,               -- la clase que hay que cubrir
  instructor_original_id text,           -- quién dio la baja
  motivo text,
  estado text NOT NULL DEFAULT 'buscando',
  ranking jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{instructor_id, score, motivos:[texto humano]}]
  candidata_actual integer NOT NULL DEFAULT 0,  -- índice dentro de ranking
  sustituta_final_id text,
  aprobada_por uuid,                     -- auth.users (propietaria que aprobó)
  aprobada_at timestamp with time zone,
  creado_en timestamp with time zone DEFAULT now(),
  resuelto_en timestamp with time zone,
  CONSTRAINT sustituciones_pkey PRIMARY KEY (id),
  CONSTRAINT sustituciones_estado_check CHECK (estado IN (
    'buscando', 'pendiente_aprobacion', 'contactando',
    'confirmada', 'sin_sustituta', 'resuelta_fuera', 'cancelada'
  ))
);

ALTER TABLE ONLY public.sustituciones
  ADD CONSTRAINT sustituciones_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sustituciones
  ADD CONSTRAINT sustituciones_sesion_id_fkey
  FOREIGN KEY (sesion_id) REFERENCES public.sesiones(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sustituciones
  ADD CONSTRAINT sustituciones_instructor_original_fkey
  FOREIGN KEY (instructor_original_id) REFERENCES public.instructores(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sustituciones
  ADD CONSTRAINT sustituciones_sustituta_final_fkey
  FOREIGN KEY (sustituta_final_id) REFERENCES public.instructores(id) ON DELETE SET NULL;

-- IDEMPOTENCIA: máx. 1 sustitución ACTIVA por sesión. Un doble-tap de "no puedo"
-- choca contra este índice → el endpoint devuelve la existente, no crea otra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sustitucion_activa_por_sesion
  ON public.sustituciones (sesion_id)
  WHERE estado NOT IN ('sin_sustituta', 'resuelta_fuera', 'cancelada');

CREATE INDEX IF NOT EXISTS idx_sustituciones_studio
  ON public.sustituciones USING btree (studio_id);
-- El cron de recordatorios barre solo las que están 'contactando'.
CREATE INDEX IF NOT EXISTS idx_sustituciones_contactando
  ON public.sustituciones USING btree (estado) WHERE estado = 'contactando';

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · CONTACTOS (cada intento a una candidata + token firmado de un solo uso)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sustitucion_contactos (
  id text NOT NULL,
  studio_id text NOT NULL,
  sustitucion_id text NOT NULL,
  instructor_id text NOT NULL,           -- la candidata contactada
  canal text NOT NULL,
  estado text NOT NULL DEFAULT 'enviado',
  token text,                            -- jti/hash del deep link firmado (spec §3.1 del doc)
  enviado_en timestamp with time zone DEFAULT now(),
  respondido_en timestamp with time zone,
  CONSTRAINT sustitucion_contactos_pkey PRIMARY KEY (id),
  CONSTRAINT sustitucion_contactos_canal_check
    CHECK (canal IN ('email', 'whatsapp', 'sms', 'llamada', 'push')),
  CONSTRAINT sustitucion_contactos_estado_check
    CHECK (estado IN ('enviado', 'fallido', 'leido', 'aceptado', 'rechazado', 'expirado', 'invalidado'))
);

ALTER TABLE ONLY public.sustitucion_contactos
  ADD CONSTRAINT sustitucion_contactos_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sustitucion_contactos
  ADD CONSTRAINT sustitucion_contactos_sustitucion_id_fkey
  FOREIGN KEY (sustitucion_id) REFERENCES public.sustituciones(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sustitucion_contactos
  ADD CONSTRAINT sustitucion_contactos_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contactos_sustitucion
  ON public.sustitucion_contactos USING btree (sustitucion_id);
CREATE INDEX IF NOT EXISTS idx_contactos_token
  ON public.sustitucion_contactos USING btree (token) WHERE token IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · RLS + GRANTS (idéntico patrón a 0018)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.instructora_disponibilidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructora_disponibilidad_excepciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustituciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustitucion_contactos ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_instructora_disponibilidad ON public.instructora_disponibilidad
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

CREATE POLICY admin_instructora_disp_exc ON public.instructora_disponibilidad_excepciones
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

CREATE POLICY admin_sustituciones ON public.sustituciones
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

CREATE POLICY admin_sustitucion_contactos ON public.sustitucion_contactos
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.instructora_disponibilidad TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.instructora_disponibilidad_excepciones TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.sustituciones TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.sustitucion_contactos TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · FUNCIONES DE SOLO LECTURA — derivan datos reales, sin contadores mutables
-- ───────────────────────────────────────────────────────────────────────────

-- El adaptador del wedge: alumnas apuntadas a una sesión, con sus contactos
-- reales del sistema de reservas existente (para el aviso ante cancelación).
CREATE OR REPLACE FUNCTION public.alumnas_apuntadas(p_sesion_id text)
RETURNS TABLE (socio_id text, nombre text, email text, telefono text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT s.id, (s.nombre || ' ' || COALESCE(s.apellidos, '')), s.email, s.telefono
  FROM public.reservas r
  JOIN public.socios s ON s.id = r.socio_id
  WHERE r.sesion_id = p_sesion_id
    AND r.estado = 'CONFIRMADA'
    AND s.borrado_en IS NULL;
$$;

-- "Pocas horas este mes" (scoring +20): horas ya impartidas este mes, derivadas
-- de sesiones. Nunca un contador que derive; se corrige solo si algo se cancela.
CREATE OR REPLACE FUNCTION public.instructor_horas_mes(
  p_instructor_id text,
  p_ref timestamptz DEFAULT now()
)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (fin - inicio)) / 3600.0), 0)::numeric
  FROM public.sesiones
  WHERE instructor_id = p_instructor_id
    AND cancelada = false
    AND inicio >= date_trunc('month', p_ref)
    AND inicio <  date_trunc('month', p_ref) + interval '1 month';
$$;

-- Anti-doble-reserva (elegibilidad §3.3.3): ¿la candidata ya tiene una clase que
-- solape con esa franja? Comparación directa de rangos tstz (inicio/fin ya son
-- absolutos → sin gimnasia de timezone).
CREATE OR REPLACE FUNCTION public.instructor_tiene_conflicto(
  p_instructor_id text,
  p_inicio timestamptz,
  p_fin timestamptz,
  p_excluir_sesion text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sesiones
    WHERE instructor_id = p_instructor_id
      AND cancelada = false
      AND (p_excluir_sesion IS NULL OR id <> p_excluir_sesion)
      AND tstzrange(inicio, fin) && tstzrange(p_inicio, p_fin)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA sobre la aceptación atómica (§3.2 del doc): NO necesita función. Es un
-- único UPDATE con guard, atómico por sí mismo en Postgres, ejecutado desde el
-- endpoint del token:
--   UPDATE public.sustituciones
--      SET estado='confirmada', sustituta_final_id=:cand, resuelto_en=now()
--    WHERE id=:sust AND estado='contactando'   -- gana quien llega primero
--   RETURNING id;
-- 0 filas → alguien confirmó antes: responder "ya está cubierta", NO reasignar.
-- La reasignación de la clase (UPDATE sesiones SET instructor_id=:cand) va en la
-- MISMA transacción. Esto vive en el código del endpoint, no en la migración.
-- ═══════════════════════════════════════════════════════════════════════════
