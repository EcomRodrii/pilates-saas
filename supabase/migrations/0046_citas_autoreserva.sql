-- ═══════════════════════════════════════════════════════════════════════════
-- 0046 · TENTARE — auto-reserva de citas 1:1 (catálogo de servicios + horario fino)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Habilita que una socia reserve ELLA MISMA una cita individual (privada,
-- evaluación, fisioterapia, online) desde el portal / widget público, sin pasar
-- por recepción. Dos piezas nuevas:
--
--   1) `citas_servicios` — catálogo por estudio: cada servicio define su duración,
--      precio y si es AUTO-RESERVABLE (visible para que la socia lo reserve sola).
--      Hoy `citas.tipo` es texto libre y la duración/precio se teclean a mano en
--      recepción; esto lo estructura.
--
--   2) `citas_disponibilidad` — horario FINO por instructora (varias franjas por
--      día de la semana), distinto del modelo grueso de 3 bandas de Sustituciones
--      (`instructora_disponibilidad`), que daría huecos irreales para citas 1:1.
--
-- Además, `citas.servicio_id` enlaza una cita reservada con su servicio, y la
-- función atómica `reservar_cita` serializa reservas concurrentes de la misma
-- instructora para que dos socias no cojan el mismo hueco (no había guardia).
--
-- Patrón RLS/grants idéntico a 0044/0037. La creación self-service NO usa políticas
-- anon: entra por service-role (getSupabaseAdmin) igual que las reservas de clase.
-- Reversible: DROP FUNCTION + DROP TABLE + DROP COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Catálogo de servicios de cita ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.citas_servicios (
  id text NOT NULL,
  studio_id text NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'PRIVADA',      -- PRIVADA/EVALUACION/FISIOTERAPIA/ONLINE
  duracion_min integer NOT NULL DEFAULT 60,
  precio numeric(10,2),                       -- null = sin precio fijo (informar en estudio)
  auto_reservable boolean NOT NULL DEFAULT false,  -- visible en la reserva pública
  color text,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  orden integer NOT NULL DEFAULT 0,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT citas_servicios_pkey PRIMARY KEY (id),
  CONSTRAINT citas_servicios_tipo_check CHECK (tipo IN ('PRIVADA','EVALUACION','FISIOTERAPIA','ONLINE')),
  CONSTRAINT citas_servicios_duracion_check CHECK (duracion_min BETWEEN 5 AND 480),
  CONSTRAINT citas_servicios_precio_check CHECK (precio IS NULL OR precio >= 0)
);

ALTER TABLE public.citas_servicios DROP CONSTRAINT IF EXISTS citas_servicios_studio_id_fkey;
ALTER TABLE ONLY public.citas_servicios
  ADD CONSTRAINT citas_servicios_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_citas_servicios_studio
  ON public.citas_servicios USING btree (studio_id, activo);

ALTER TABLE public.citas_servicios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_citas_servicios ON public.citas_servicios;
CREATE POLICY admin_citas_servicios ON public.citas_servicios
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));
GRANT ALL ON TABLE public.citas_servicios TO anon, authenticated, service_role;

-- ── 2) Horario fino por instructora ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.citas_disponibilidad (
  id text NOT NULL,
  studio_id text NOT NULL,
  instructor_id text NOT NULL,
  dia_semana integer NOT NULL,               -- 0=domingo..6=sábado (Postgres DOW)
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT citas_disponibilidad_pkey PRIMARY KEY (id),
  CONSTRAINT citas_disponibilidad_dia_check CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT citas_disponibilidad_horas_check CHECK (hora_fin > hora_inicio)
);

ALTER TABLE public.citas_disponibilidad DROP CONSTRAINT IF EXISTS citas_disponibilidad_studio_id_fkey;
ALTER TABLE ONLY public.citas_disponibilidad
  ADD CONSTRAINT citas_disponibilidad_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE public.citas_disponibilidad DROP CONSTRAINT IF EXISTS citas_disponibilidad_instructor_id_fkey;
ALTER TABLE ONLY public.citas_disponibilidad
  ADD CONSTRAINT citas_disponibilidad_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_citas_disp_instructor
  ON public.citas_disponibilidad USING btree (instructor_id, dia_semana);

ALTER TABLE public.citas_disponibilidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_citas_disponibilidad ON public.citas_disponibilidad;
CREATE POLICY admin_citas_disponibilidad ON public.citas_disponibilidad
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));
GRANT ALL ON TABLE public.citas_disponibilidad TO anon, authenticated, service_role;

-- ── 3) Enlace cita → servicio + índice de colisiones ─────────────────────────
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS servicio_id text;
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_servicio_id_fkey;
ALTER TABLE ONLY public.citas
  ADD CONSTRAINT citas_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES public.citas_servicios(id) ON DELETE SET NULL;

-- Colisiones de instructora por franja horaria (lo consulta reservar_cita y el panel).
CREATE INDEX IF NOT EXISTS idx_citas_instructor_inicio
  ON public.citas USING btree (instructor_id, inicio);

-- ── 4) Reserva atómica de cita (anti doble-reserva del mismo hueco) ───────────
-- Serializa las reservas concurrentes de la misma instructora con un advisory
-- lock de transacción, comprueba solapes con otras citas activas y con sesiones
-- de grupo no canceladas, y sólo entonces inserta. Devuelve 'CONFIRMADA' o
-- 'CONFLICTO'. El lock se libera al cerrar la transacción del rpc.
CREATE OR REPLACE FUNCTION public.reservar_cita(
  p_id text, p_studio_id text, p_socio_id text, p_instructor_id text,
  p_servicio_id text, p_tipo text, p_inicio timestamptz, p_fin timestamptz,
  p_precio numeric, p_notas text
) RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conflict integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_studio_id || ':' || p_instructor_id));

  -- ¿Solapa con otra cita activa (pendiente/confirmada) de la instructora?
  SELECT count(*) INTO v_conflict FROM public.citas c
  WHERE c.instructor_id = p_instructor_id
    AND c.estado IN ('PENDIENTE','CONFIRMADA')
    AND tstzrange(c.inicio, c.fin) && tstzrange(p_inicio, p_fin);
  IF v_conflict > 0 THEN RETURN 'CONFLICTO'; END IF;

  -- ¿Solapa con una sesión de grupo suya no cancelada?
  SELECT count(*) INTO v_conflict FROM public.sesiones s
  WHERE s.instructor_id = p_instructor_id
    AND COALESCE(s.cancelada, false) = false
    AND tstzrange(s.inicio, s.fin) && tstzrange(p_inicio, p_fin);
  IF v_conflict > 0 THEN RETURN 'CONFLICTO'; END IF;

  INSERT INTO public.citas
    (id, studio_id, socio_id, instructor_id, servicio_id, tipo, inicio, fin, precio, notas, estado, pagada)
  VALUES
    (p_id, p_studio_id, p_socio_id, p_instructor_id, p_servicio_id, p_tipo, p_inicio, p_fin, p_precio, p_notas, 'CONFIRMADA', false);

  RETURN 'CONFIRMADA';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_cita(text, text, text, text, text, text, timestamptz, timestamptz, numeric, text)
  TO authenticated, service_role;
