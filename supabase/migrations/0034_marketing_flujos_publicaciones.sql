-- Fase 7 (continuación) — constructor de flujos + asociación de publicaciones.
-- Aditivo y no destructivo: columnas jsonb nullable, sin tocar datos ni RLS.
-- Seguro de re-ejecutar.

-- Automatizaciones: cadena de pasos del constructor visual de flujos.
--  jsonb array de { id, accion, config }.
ALTER TABLE public.automatizaciones
  ADD COLUMN IF NOT EXISTS pasos jsonb;

-- Campañas: publicaciones del módulo Contenido asociadas (snapshot).
--  jsonb array de { id, titulo, plataformas }.
ALTER TABLE public.campanas
  ADD COLUMN IF NOT EXISTS publicaciones jsonb;
