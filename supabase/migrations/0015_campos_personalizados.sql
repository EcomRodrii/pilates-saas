-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 · Campos personalizados de socia (Tanda 2 · Pieza B)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (adaptar checklist de onboarding)
-- La ficha de socia tenía campos fijos (nombre, email, teléfono, NIF, fecha de
-- nacimiento, dirección) + tags[]. No había forma de que cada estudio recogiera
-- datos propios (lesiones, objetivos, cómo nos conoció, talla, etc.).
--
-- MODELO
-- - `campos_personalizados`: la DEFINICIÓN de cada campo por estudio (etiqueta,
--   tipo, opciones para listas, si es obligatorio, orden, activo). Misma postura
--   de seguridad que el resto (RLS por estudio, réplica de comentarios_comunidad).
-- - `socios.campos_extra` (jsonb): los VALORES por socia, indexados por el id del
--   campo → `{ "<campoId>": <valor> }`. jsonb (no tabla de valores) porque son
--   pocos campos por socia y se leen/escriben junto con la ficha; evita joins.
--
-- tipo ∈ texto | numero | fecha | booleano | seleccion. Para `seleccion`,
-- `opciones` guarda la lista de valores posibles.
--
-- Reversible: DROP TABLE + DROP COLUMN (additiva, no toca datos existentes).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.campos_personalizados (
  id text NOT NULL,
  studio_id text NOT NULL,
  etiqueta text NOT NULL,
  tipo text NOT NULL DEFAULT 'texto',
  opciones text[] DEFAULT '{}'::text[],
  requerido boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamp with time zone DEFAULT now(),
  CONSTRAINT campos_personalizados_pkey PRIMARY KEY (id),
  CONSTRAINT campos_personalizados_tipo_check
    CHECK (tipo IN ('texto', 'numero', 'fecha', 'booleano', 'seleccion'))
);

ALTER TABLE ONLY public.campos_personalizados
  ADD CONSTRAINT campos_personalizados_studio_id_fkey
  FOREIGN KEY (studio_id) REFERENCES public.studios(id) ON DELETE CASCADE;

-- La página de configuración y las fichas cargan los campos del estudio por orden.
CREATE INDEX IF NOT EXISTS idx_campos_personalizados_studio
  ON public.campos_personalizados USING btree (studio_id, orden);

-- RLS por estudio (misma política que comentarios_comunidad).
ALTER TABLE public.campos_personalizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_campos_personalizados ON public.campos_personalizados
  TO authenticated
  USING ((studio_id = public.current_studio_id()))
  WITH CHECK ((studio_id = public.current_studio_id()));

GRANT ALL ON TABLE public.campos_personalizados TO anon;
GRANT ALL ON TABLE public.campos_personalizados TO authenticated;
GRANT ALL ON TABLE public.campos_personalizados TO service_role;

-- Valores por socia: { "<campoId>": <valor> }. Default {} para no leer NULL.
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS campos_extra jsonb NOT NULL DEFAULT '{}'::jsonb;
