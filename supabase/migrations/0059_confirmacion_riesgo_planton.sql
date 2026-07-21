-- ═══════════════════════════════════════════════════════════════════════════
-- 0059 · TENTARE — pedir confirmación a riesgo de plantón (opción 2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- lib/no-show.ts (PR #172) y R4 (PR #210) ya DETECTAN quién tiene riesgo alto
-- de faltar. Esta migración es la base de datos para la siguiente pieza: en
-- vez de solo recordar, PEDIR CONFIRMACIÓN a esas socias y, si no responden a
-- tiempo, liberar su plaza a quien esté en lista de espera — convierte un
-- plantón probable en una plaza vendida.
--
-- `pedir_confirmacion_riesgo`: apagado por defecto. Pedir confirmación y
-- CANCELAR de verdad una reserva si no responde es una acción real sobre una
-- socia de pago — mismo criterio que `avisar_alumnas` en sustituciones
-- (migración 0039): el estudio lo enciende conscientemente, no le llega activado.
--
-- `confirmacion_pedida_en` / `confirmado_en`: metadata sobre la reserva, NO un
-- estado nuevo en `EstadoReserva`. La reserva sigue siendo 'CONFIRMADA' todo el
-- tiempo que dura la espera — introducir un estado nuevo tipo
-- 'ESPERANDO_CONFIRMACION' obligaría a tocar las ~16 comprobaciones de
-- `estado = 'CONFIRMADA'` repartidas por aforo/ocupación/scoring de no-shows en
-- todo el repo. El corte real (liberar la plaza) sigue siendo el mismo camino
-- ya probado: `cancelar_reserva_plaza` (0000_base), que cancela y promociona la
-- lista de espera de forma atómica.
--
-- Índice parcial que calza exactamente con la consulta del barrido de corte
-- (pedida pero sin confirmar, reserva aún activa): sin él, cada pasada del cron
-- (cada 30 min) escanearía toda la tabla `reservas`.
--
-- Reversible: DROP INDEX + ALTER TABLE ... DROP COLUMN (studios.pedir_confirmacion_riesgo,
-- reservas.confirmacion_pedida_en, reservas.confirmado_en).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS pedir_confirmacion_riesgo boolean NOT NULL DEFAULT false;

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS confirmacion_pedida_en timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_reservas_confirmacion_pendiente
  ON public.reservas (sesion_id)
  WHERE confirmacion_pedida_en IS NOT NULL AND confirmado_en IS NULL AND estado = 'CONFIRMADA';

COMMENT ON COLUMN public.studios.pedir_confirmacion_riesgo IS
  'Pedir confirmación a socias de riesgo ALTO de plantón y liberar su plaza a la lista de espera si no responden a tiempo. Apagado por defecto.';
COMMENT ON COLUMN public.reservas.confirmacion_pedida_en IS
  'Cuándo se le pidió confirmar que viene (riesgo de plantón). NULL = no se le ha pedido.';
COMMENT ON COLUMN public.reservas.confirmado_en IS
  'Cuándo confirmó que viene, desde el enlace sin login. NULL = no ha confirmado (o no se le pidió).';
