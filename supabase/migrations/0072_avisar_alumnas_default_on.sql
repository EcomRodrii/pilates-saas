-- ═══════════════════════════════════════════════════════════════════════════
-- 0072 · TENTARE — avisar a las alumnas al confirmar sustitución, por defecto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La landing y el flujo de sustituciones prometen "alumnas avisadas" cuando se
-- confirma una sustituta, pero studios.avisar_alumnas nació en false (0039) por
-- prudencia durante el desarrollo: a fecha de esta migración solo 1 estudio de
-- 14 lo tenía activado, así que el aviso automático prometido no salía casi
-- nunca. Se invierte el default y se enciende en los 13 restantes (todos en el
-- false de fábrica) — el toggle sigue en el panel de Sustituciones para quien
-- quiera apagarlo.
--
-- Reversible: ALTER COLUMN ... SET DEFAULT false (quien lo toque a mano tras
-- esta migración conserva su valor en cualquier caso).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ALTER COLUMN avisar_alumnas SET DEFAULT true;

UPDATE public.studios SET avisar_alumnas = true WHERE avisar_alumnas = false;
