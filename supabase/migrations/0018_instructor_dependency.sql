-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 · Riesgo de concentración por instructor (Instructor Dependency Risk)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- OBJETIVO
-- Detectar cuánta facturación y cuántas socias dependen de cada instructor, para
-- avisar al estudio del riesgo de fuga de cartera si ese instructor se va.
--
-- MODELO
-- - `instructor_dependency_snapshots`: una fila por (estudio, instructor) con el
--   resultado del cálculo más reciente (upsert; no se guarda histórico). Cálculo
--   determinista sobre asistencias (`reservas.estado='ASISTIDA'`) e ingresos
--   (`recibos` COBRADO + `ventas_pos`) en una ventana móvil. `detalle` (jsonb)
--   lleva la lista de socias cautivas y su gasto para el modal del dashboard.
-- - Umbrales configurables por estudio en `studios` (alto/medio en % + ventana
--   en días). Defaults 25 / 15 / 90 según la spec.
--
-- RLS por estudio (misma política que comentarios_comunidad). El cálculo corre en
-- servidor con service-role (cron + on-demand); la lectura del panel va por la
-- anon key con la sesión del estudio.
--
-- Reversible: DROP TABLE + DROP COLUMN (additiva).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.instructor_dependency_snapshots (
  id text NOT NULL,
  studio_id text NOT NULL,
  instructor_id text NOT NULL,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  ventana_dias integer NOT NULL DEFAULT 90,
  alumnas_total integer NOT NULL DEFAULT 0,
  alumnas_cautivas_count integer NOT NULL DEFAULT 0,
  ingresos_cautivos numeric(12,2) NOT NULL DEFAULT 0,
  ingresos_total_estudio numeric(12,2) NOT NULL DEFAULT 0,
  porcentaje_facturacion numeric(5,2) NOT NULL DEFAULT 0,
  nivel_riesgo text NOT NULL DEFAULT 'BAJO',
  detalle jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT instructor_dependency_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT instructor_dependency_snapshots_studio_instructor_key UNIQUE (studio_id, instructor_id),
  CONSTRAINT instructor_dependency_snapshots_nivel_check
    CHECK (nivel_riesgo IN ('ALTO', 'MEDIO', 'BAJO'))
);

ALTER TABLE ONLY public.instructor_dependency_snapshots
  ADD CONSTRAINT instructor_dependency_snapshots_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.instructor_dependency_snapshots
  ADD CONSTRAINT instructor_dependency_snapshots_instructor_id_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.instructores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_instructor_dependency_studio
  ON public.instructor_dependency_snapshots USING btree (studio_id);

ALTER TABLE public.instructor_dependency_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_instructor_dependency_snapshots ON public.instructor_dependency_snapshots
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.instructor_dependency_snapshots TO anon;
GRANT ALL ON TABLE public.instructor_dependency_snapshots TO authenticated;
GRANT ALL ON TABLE public.instructor_dependency_snapshots TO service_role;

-- Umbrales configurables por estudio (spec: >25% alto, 15-25% medio, <15% bajo).
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS dep_umbral_alto numeric(5,2) NOT NULL DEFAULT 25;
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS dep_umbral_medio numeric(5,2) NOT NULL DEFAULT 15;
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS dep_ventana_dias integer NOT NULL DEFAULT 90;
