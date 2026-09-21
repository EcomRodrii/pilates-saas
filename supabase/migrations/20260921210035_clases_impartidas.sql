-- Clases impartidas: saber qué clase dio de verdad cada instructora y a qué hora.
--
-- Es CONTROL HORARIO, no asistencia de alumnas: una fila por clase dada (o que
-- su instructora dice que no dio). «Sin confirmar» no se guarda: es una clase
-- pasada, no cancelada y sin fila. «En curso» tampoco: una fila DADA con
-- `fin_real` nulo cuyo fin programado aún no ha llegado. Sin cron: el cierre a
-- la hora programada se deriva (fin efectivo = fin_real ?? sesiones.fin).
--
-- Escrituras solo desde el servidor (service_role), desde la app del estudio y el
-- panel. Al cliente autenticado solo le queda SELECT, acotado por RLS.
--
-- `instructor_tarifas.relacion_laboral`: contratada (registro de jornada
-- obligatorio) o autónoma (no ficha jornada). Va con la retribución y no en
-- `instructores` porque esa tabla la lee entera todo el estudio.

ALTER TABLE public.instructor_tarifas
  ADD COLUMN IF NOT EXISTS relacion_laboral text
    CHECK (relacion_laboral IS NULL OR relacion_laboral IN ('CONTRATADA', 'AUTONOMA'));

CREATE TABLE IF NOT EXISTS public.clases_impartidas (
  sesion_id text PRIMARY KEY REFERENCES public.sesiones(id) ON DELETE CASCADE,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  instructor_id text NOT NULL REFERENCES public.instructores(id) ON DELETE CASCADE,
  estado text NOT NULL CHECK (estado IN ('DADA', 'NO_DADA')),
  inicio_real timestamptz,
  fin_real timestamptz,
  -- Cómo se supo: botón «Empezar clase», al pasar lista, confirmada después por
  -- ella, o corregida por quien gestiona el equipo.
  origen text NOT NULL CHECK (origen IN ('BOTON', 'LISTA', 'CONFIRMACION', 'PROPIETARIA')),
  revisada_en timestamptz,
  revisada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  edited_at timestamptz,
  edited_by uuid,
  CONSTRAINT clases_impartidas_coherente CHECK (
    (estado = 'DADA' AND inicio_real IS NOT NULL AND (fin_real IS NULL OR fin_real > inicio_real))
    OR (estado = 'NO_DADA' AND inicio_real IS NULL AND fin_real IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_clases_impartidas_instructora
  ON public.clases_impartidas (studio_id, instructor_id, inicio_real DESC);

ALTER TABLE public.clases_impartidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY clases_impartidas_select ON public.clases_impartidas
  FOR SELECT TO authenticated
  USING (
    studio_id = current_studio_id()
    AND (instructor_id = current_instructor_id() OR public.puede_gestionar_equipo())
  );

REVOKE ALL ON public.clases_impartidas FROM anon, authenticated;
GRANT SELECT ON public.clases_impartidas TO authenticated;
GRANT ALL ON public.clases_impartidas TO service_role;

CREATE TABLE IF NOT EXISTS public.clases_impartidas_auditoria (
  id text PRIMARY KEY,
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  sesion_id text NOT NULL REFERENCES public.sesiones(id) ON DELETE CASCADE,
  accion text NOT NULL
    CHECK (accion IN ('EMPEZADA', 'DADA_POR_LISTA', 'CONFIRMADA', 'NO_DADA', 'FIN_CAMBIADO', 'CORREGIDA', 'REVISADA')),
  campo text,
  valor_antes text,
  valor_despues text,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clases_impartidas_auditoria_sesion
  ON public.clases_impartidas_auditoria (sesion_id, created_at DESC);

ALTER TABLE public.clases_impartidas_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY clases_impartidas_auditoria_select ON public.clases_impartidas_auditoria
  FOR SELECT TO authenticated
  USING (studio_id = current_studio_id() AND public.puede_gestionar_equipo());

REVOKE ALL ON public.clases_impartidas_auditoria FROM anon, authenticated;
GRANT SELECT ON public.clases_impartidas_auditoria TO authenticated;
GRANT ALL ON public.clases_impartidas_auditoria TO service_role;
