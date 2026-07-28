-- Pantalla de bienvenida a pantalla completa tras crear el estudio (intro +
-- wizard rápido + resumen), mostrada UNA sola vez. bienvenida_vista_en sigue
-- el mismo patrón que onboarding_descartado_en (0058): NULL = aún no la ha
-- visto, vive en el estudio (no en localStorage) para que la vea igual quien
-- entre desde cualquier dispositivo.
--
-- Las columnas onb_* guardan las respuestas del wizard (centros, software
-- anterior, alumnos activos, si quiere importar datos, qué le preocupa, cómo
-- quiere que le ayudemos) — sin FK ni CHECK, mismo criterio que
-- como_nos_conocio (0118): son opciones de un <select> de la UI, no un
-- catálogo con reglas propias.

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS bienvenida_vista_en timestamptz,
  ADD COLUMN IF NOT EXISTS onb_centros text,
  ADD COLUMN IF NOT EXISTS onb_software_anterior text,
  ADD COLUMN IF NOT EXISTS onb_alumnos_activos text,
  ADD COLUMN IF NOT EXISTS onb_importar_datos text,
  ADD COLUMN IF NOT EXISTS onb_prioridad text[],
  ADD COLUMN IF NOT EXISTS onb_ayuda_alta text;

-- Backfill CRÍTICO: sin esto, todo estudio ya existente (creado antes de esta
-- migración) vería la bienvenida de alta en su próxima visita — un wizard de
-- "bienvenida, vamos a configurar tu estudio" lanzado sobre clientas que
-- llevan meses usando el producto. Solo deben verla los estudios creados
-- DESPUÉS de este cambio.
UPDATE public.studios SET bienvenida_vista_en = now() WHERE bienvenida_vista_en IS NULL;

COMMENT ON COLUMN public.studios.bienvenida_vista_en IS
  'Cuándo se completó/cerró la pantalla de bienvenida tras el alta. NULL = estudio nuevo, aún no la ha visto.';
COMMENT ON COLUMN public.studios.onb_centros IS 'Respuesta del wizard de bienvenida: "¿Cuántos centros tienes?"';
COMMENT ON COLUMN public.studios.onb_software_anterior IS 'Respuesta del wizard de bienvenida: "¿Desde qué software vienes?"';
COMMENT ON COLUMN public.studios.onb_alumnos_activos IS 'Respuesta del wizard de bienvenida: "¿Cuántos alumnos activos tienes?"';
COMMENT ON COLUMN public.studios.onb_importar_datos IS 'Respuesta del wizard de bienvenida: "¿Quieres que importemos tus datos?"';
COMMENT ON COLUMN public.studios.onb_prioridad IS 'Respuesta del wizard de bienvenida (multi, hasta 2): "¿Qué es lo que más te preocupa ahora mismo?"';
COMMENT ON COLUMN public.studios.onb_ayuda_alta IS 'Respuesta del wizard de bienvenida: "¿Cómo prefieres que te ayudemos?"';
