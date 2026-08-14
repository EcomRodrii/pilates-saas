-- ═══════════════════════════════════════════════════════════════════════════
-- Importador de temas ZIP — la metadata de cada ZIP subido desde Claude Design
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO: el kit de temas hasta hoy (`themes/<id>/{config.ts,tokens.css}`)
-- es SIEMPRE código escrito a mano, traduciendo un prototipo de Design a la
-- implementación compartida de Tentare. Esto es lo contrario a propósito:
-- guardar el ZIP TAL CUAL, sin reconstruirlo — el HTML/CSS/JS/assets originales
-- se suben a R2 (`lib/r2.ts`) y esta tabla solo guarda el manifest y dónde
-- están. El render sirve ese HTML/CSS ORIGINAL dentro de un iframe en sandbox,
-- no un componente de React que lo aproxima.
--
-- Por qué NO va el contenido del ZIP en esta tabla: puede tener decenas de
-- ficheros y varios MB de imágenes/fuentes — Postgres no es el sitio para eso,
-- mismo criterio que ya usan los backups (`lib/r2.ts`, migración 0002).
--
-- Reversible: DROP TABLE.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.theme_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id text NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  -- Ver `ImportedThemeManifest` en lib/theme-import/manifest.ts. Guardado tal
  -- cual como jsonb para no acoplar el esquema de DB a cada campo nuevo del
  -- manifest — mismo criterio que `studio_theme.config_draft`.
  manifest jsonb NOT NULL,
  -- Prefijo de la clave en R2 bajo el que viven TODOS los ficheros extraídos
  -- de este ZIP: "temas-importados/<studio_id>/<id>/". Cada ruta del manifest
  -- es relativa a este prefijo.
  storage_prefix text NOT NULL,
  -- Ruta (relativa al prefijo) del HTML que se sirve como entrada del iframe.
  -- NULL si el ZIP no trae ningún HTML reconocible — ver `estado`.
  entry_html text,
  estado text NOT NULL DEFAULT 'procesando'
    CHECK (estado IN ('procesando', 'listo', 'incompatible', 'error')),
  -- Por qué quedó `incompatible`/`error`, en el lenguaje del punto 14 del
  -- encargo: nunca una aproximación silenciosa, siempre un motivo explícito.
  detalle text,
  creado_en timestamp with time zone NOT NULL DEFAULT now(),
  creado_por text
);

CREATE INDEX IF NOT EXISTS theme_imports_studio_id_idx ON public.theme_imports (studio_id);

-- RLS: mismo patrón que `studio_theme` (migración 0019) — cualquier miembro
-- del staff del estudio puede LEER, solo PROPIETARIO puede escribir. El
-- upload en sí lo hace la API con service-role (el ZIP puede pesar varios MB
-- y necesita subir a R2 antes de poder insertar esta fila); esta policy cubre
-- el listado/borrado desde el panel con la sesión normal del navegador.
ALTER TABLE public.theme_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_theme_imports ON public.theme_imports
  FOR SELECT
  TO authenticated
  USING (studio_id = public.current_studio_id());

CREATE POLICY write_theme_imports ON public.theme_imports
  FOR ALL
  TO authenticated
  USING (studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO')
  WITH CHECK (studio_id = public.current_studio_id() AND public.current_rol() = 'PROPIETARIO');

-- Sin GRANT a anon: nadie fuera del estudio necesita leer esto directamente.
-- El iframe de render sirve el HTML/CSS extraído desde R2 por su propia URL
-- firmada, no consultando esta tabla.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.theme_imports TO authenticated;
GRANT ALL ON TABLE public.theme_imports TO service_role;
