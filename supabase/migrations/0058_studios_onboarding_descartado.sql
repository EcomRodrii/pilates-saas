-- El checklist de "Primeros pasos" guardaba su estado "descartado" en
-- localStorage: se perdía al cambiar de navegador y no era compartido entre
-- quienes trabajan en el mismo estudio (la propietaria lo cierra en su
-- portátil y la recepcionista lo sigue viendo en el suyo). Cada paso en sí
-- NO necesita persistencia — se calcula en vivo a partir de datos reales
-- (¿hay instructoras?, ¿hay clases?...) — pero el "ya lo he visto, no me lo
-- vuelvas a enseñar" sí necesita vivir en el estudio, no en el navegador.

ALTER TABLE public.studios
  ADD COLUMN onboarding_descartado_en timestamptz;

COMMENT ON COLUMN public.studios.onboarding_descartado_en IS
  'Cuándo se descartó el checklist de primeros pasos. NULL = sigue siendo relevante mostrarlo (si queda algún paso pendiente).';
