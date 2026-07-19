-- ═══════════════════════════════════════════════════════════════════════════
-- 0044 · TENTARE — valoraciones de instructoras (las alumnas puntúan tras la clase)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bucle público: tras una clase, se pide a las alumnas apuntadas que la valoren
-- (1-5 ⭐ + comentario) mediante un deep link firmado sin login. Se atribuye a
-- la instructora que REALMENTE dio la clase (sesiones.instructor_id en ese
-- momento — que puede ser una sustituta). Una valoración por alumna y clase.
--
-- Patrón RLS/grants idéntico a 0037/0018. Reversible: DROP TABLE + DROP COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.valoraciones (
  id text NOT NULL,
  studio_id text NOT NULL,
  instructor_id text NOT NULL,           -- a quién se valora (quien dio la clase)
  sesion_id text NOT NULL,               -- la clase valorada
  socio_id text NOT NULL,                -- quién valora (la alumna)
  puntuacion integer NOT NULL,
  comentario text,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT valoraciones_pkey PRIMARY KEY (id),
  CONSTRAINT valoraciones_puntuacion_check CHECK (puntuacion BETWEEN 1 AND 5)
);

ALTER TABLE ONLY public.valoraciones
  ADD CONSTRAINT valoraciones_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valoraciones
  ADD CONSTRAINT valoraciones_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valoraciones
  ADD CONSTRAINT valoraciones_sesion_id_fkey
  FOREIGN KEY (sesion_id) REFERENCES public.sesiones(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.valoraciones
  ADD CONSTRAINT valoraciones_socio_id_fkey
  FOREIGN KEY (socio_id) REFERENCES public.socios(id) ON DELETE CASCADE;

-- Una valoración por alumna y clase (idempotencia: reenviar el link no duplica).
CREATE UNIQUE INDEX IF NOT EXISTS uq_valoracion_socio_sesion
  ON public.valoraciones (socio_id, sesion_id);
CREATE INDEX IF NOT EXISTS idx_valoraciones_instructor
  ON public.valoraciones USING btree (instructor_id);
CREATE INDEX IF NOT EXISTS idx_valoraciones_studio
  ON public.valoraciones USING btree (studio_id);

ALTER TABLE public.valoraciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_valoraciones ON public.valoraciones
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));
GRANT ALL ON TABLE public.valoraciones TO anon, authenticated, service_role;

-- Dedup del envío automático: marca cuándo se pidió valoración de una clase.
ALTER TABLE public.sesiones ADD COLUMN IF NOT EXISTS valoracion_pedida_en timestamp with time zone;

-- Agregado por instructora para el estudio (media 1 decimal + total). Lo consume
-- Equipo y el ranking de sustituciones.
CREATE OR REPLACE FUNCTION public.valoraciones_resumen_estudio(p_studio_id text)
RETURNS TABLE(instructor_id text, media numeric, total bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT v.instructor_id, round(avg(v.puntuacion), 1)::numeric, count(*)::bigint
  FROM public.valoraciones v
  WHERE v.studio_id = p_studio_id
  GROUP BY v.instructor_id;
$$;

GRANT EXECUTE ON FUNCTION public.valoraciones_resumen_estudio(text)
  TO authenticated, service_role;
