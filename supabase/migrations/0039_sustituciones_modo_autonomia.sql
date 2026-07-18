-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 · TENTARE — Modo de autonomía del estudio (para el endpoint de baja)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El estudio elige cuánta autonomía da al sistema (doc de producto §6). Al crear
-- una baja, el modo decide qué pasa tras el scoring:
--   manual / asistido  → 'pendiente_aprobacion' (la propietaria aprueba)
--   autonomo / vacaciones → 'contactando' (lo cubre solo — el cron es fase sig.)
--
-- Aditiva sobre `studios`, con defaults seguros. Reversible: DROP COLUMN.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS modo_autonomia text NOT NULL DEFAULT 'asistido';
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS umbral_score_autonomo integer NOT NULL DEFAULT 95;
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS avisar_alumnas boolean NOT NULL DEFAULT false;

-- CHECK del enum de modo (todas las filas existentes son 'asistido' → valida al vuelo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studios_modo_autonomia_check'
  ) THEN
    ALTER TABLE public.studios
      ADD CONSTRAINT studios_modo_autonomia_check
      CHECK (modo_autonomia IN ('manual', 'asistido', 'autonomo', 'vacaciones'));
  END IF;
END $$;
