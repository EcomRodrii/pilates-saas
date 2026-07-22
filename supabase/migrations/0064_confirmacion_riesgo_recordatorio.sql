-- ═══════════════════════════════════════════════════════════════════════════
-- 0064 · TENTARE — recordatorio antes del corte de confirmación por riesgo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hueco real detectado probando en vivo (0059): el sistema mandaba UN solo
-- email pidiendo confirmar y, si no había respuesta, cancelaba la reserva a
-- las 3h de la clase. Un email que se pierde en la bandeja (spam, no lo vio a
-- tiempo, lo que sea) se convertía en una cancelación real de una socia que sí
-- pensaba venir — justo lo contrario de lo que la función busca. Mismo patrón
-- que ya usa el motor de sustituciones antes de dar a alguien por "no
-- contactable": un recordatorio a mitad de camino antes de rendirse.
--
-- `recordatorio_confirmacion_en`: cuándo se mandó el recordatorio (si hizo
-- falta). NULL = no se le ha recordado (o ya confirmó a la primera y no hizo
-- falta). No es un estado nuevo, es metadata — misma razón que las dos
-- columnas de 0059: no tocar las comprobaciones de `estado = 'CONFIRMADA'`
-- repartidas por el resto del repo.
--
-- Reversible: ALTER TABLE public.reservas DROP COLUMN recordatorio_confirmacion_en;
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS recordatorio_confirmacion_en timestamptz;

COMMENT ON COLUMN public.reservas.recordatorio_confirmacion_en IS
  'Cuándo se le mandó el recordatorio de confirmar (a mitad de camino, si no había respondido). NULL = no hizo falta o no ha llegado ese punto todavía.';
