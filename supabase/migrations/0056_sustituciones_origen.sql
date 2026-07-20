-- ═══════════════════════════════════════════════════════════════════════════
-- 0056 · TENTARE — de dónde viene la baja: panel o la propia instructora
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora una baja solo podía nacer en el panel: la instructora avisaba a
-- la propietaria por WhatsApp a las 7 de la mañana y la propietaria la marcaba
-- a mano. Eso deja a la propietaria como punto único de fallo, que es
-- exactamente el dolor que valida el módulo ("nunca puedo desconectar").
--
-- Con el deep link de baja, la instructora la reporta ella misma desde el móvil
-- y el motor arranca solo. Necesitamos distinguir el origen por dos motivos
-- REALES, no decorativos:
--   1. La propietaria tiene que enterarse ANTES o A LA VEZ que las alumnas
--      (regla dura del módulo). Si la baja nace fuera del panel, hay que
--      avisarla activamente; si la marcó ella, ya lo sabe — avisarla sería
--      ruido y entrenaría a ignorar los avisos.
--   2. La card del panel puede decir la verdad: "Meri ha avisado de que no
--      puede" en vez de un genérico "nueva sustitución".
--
-- DEFAULT 'panel' → las filas existentes quedan correctamente etiquetadas
-- (todas nacieron en el panel, no había otra vía). Columna nullable-safe:
-- NOT NULL con default es seguro aquí porque la tabla es pequeña y el default
-- rellena el backfill en el mismo ALTER.
--
-- Reversible: ALTER TABLE public.sustituciones DROP COLUMN origen;
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sustituciones
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'panel';

-- CHECK aparte del ADD COLUMN para poder nombrarlo y que el error sea legible.
-- IF NOT EXISTS no aplica a constraints → bloque idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sustituciones_origen_check'
  ) THEN
    ALTER TABLE public.sustituciones
      ADD CONSTRAINT sustituciones_origen_check
      CHECK (origen IN ('panel', 'instructora'));
  END IF;
END $$;

COMMENT ON COLUMN public.sustituciones.origen IS
  'Quién marcó la baja: panel (propietaria/recepción) o instructora (deep link firmado desde su móvil).';
