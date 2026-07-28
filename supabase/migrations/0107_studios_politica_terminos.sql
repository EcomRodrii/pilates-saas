-- 0102: la política de privacidad y los términos del estudio se guardan en BD.
-- Bug (exposición legal): updateStudioConfig solo mutaba el estado de React
-- (StudioConfig nacía del texto por defecto y NUNCA se hidrataba ni se persistía).
-- La dueña editaba los textos en Configuración, veía el toast "guardado", pero no
-- se escribían: el portal de reservas y el registro de aceptación de la clienta
-- (clientas/page.tsx) leían SIEMPRE el texto por defecto → la clienta aceptaba y
-- "firmaba" un contrato que la dueña creía haber personalizado. Se persisten en
-- `studios` (null = usar el texto por defecto del cliente).
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS politica_privacidad text,
  ADD COLUMN IF NOT EXISTS terminos_servicio text;
