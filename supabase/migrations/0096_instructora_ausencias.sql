-- ─────────────────────────────────────────────────────────────────────────────
-- Ausencias de instructoras (vacaciones / baja médica / otro).
--
-- Se guarda el RANGO (lo que la dueña gestiona) y se MATERIALIZAN los bloqueos
-- día a día en `instructora_disponibilidad_excepciones` (tipo='bloqueo', todo el
-- día), que es lo que ya lee `rankear_candidatas` (migr. 0038) para excluir a una
-- instructora del ranking de sustituciones. Así las vacaciones surten efecto real
-- en el motor sin tocar la RPC.
--
-- `ausencia_id` en las excepciones enlaza cada bloqueo con su ausencia: borrar la
-- ausencia borra sus bloqueos en cascada (nada de limpieza manual).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.instructora_ausencias (
  id            text PRIMARY KEY,
  studio_id     text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  instructor_id text NOT NULL REFERENCES public.instructores(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('VACACIONES', 'BAJA_MEDICA', 'OTRO')),
  desde         date NOT NULL,
  hasta         date NOT NULL,
  motivo        text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instructora_ausencias_rango_ok CHECK (hasta >= desde)
);

CREATE INDEX IF NOT EXISTS idx_ausencias_instructor ON public.instructora_ausencias (instructor_id, desde);
CREATE INDEX IF NOT EXISTS idx_ausencias_studio ON public.instructora_ausencias (studio_id, desde DESC);

-- Enlace bloqueo → ausencia (cascada al borrar).
ALTER TABLE public.instructora_disponibilidad_excepciones
  ADD COLUMN IF NOT EXISTS ausencia_id text
  REFERENCES public.instructora_ausencias(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_disp_exc_ausencia
  ON public.instructora_disponibilidad_excepciones (ausencia_id);

-- RLS: el staff gestiona las ausencias de SU estudio (mismo criterio que el
-- resto de tablas de equipo). El servidor escribe con service-role.
ALTER TABLE public.instructora_ausencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY ausencias_staff ON public.instructora_ausencias FOR ALL TO authenticated
  USING (studio_id = current_studio_id())
  WITH CHECK (studio_id = current_studio_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructora_ausencias TO authenticated, service_role;
