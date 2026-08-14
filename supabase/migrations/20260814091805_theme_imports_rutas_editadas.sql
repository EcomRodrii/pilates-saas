-- Qué ficheros de un tema ZIP importado tienen una versión editada a mano en
-- R2 (bajo storage_prefix || 'editado/' || ruta), aparte del original subido.
-- Nunca sobrescribimos los bytes originales: así "editado" siempre puede
-- distinguirse de "tal cual vino del ZIP", y el original queda disponible
-- para comparar/depurar.
ALTER TABLE public.theme_imports
  ADD COLUMN rutas_editadas text[] NOT NULL DEFAULT '{}';
