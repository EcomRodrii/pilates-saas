-- 0041 · Dunning — gestión de impagos y reintentos automáticos de cobro
-- Fase 1 Pagos España. Completa el ciclo de cobro: cuando un cobro de un recibo
-- falla (tarjeta declinada o adeudo SEPA devuelto), se reintenta automáticamente
-- a los +1, +3 y +7 días del vencimiento. Si los tres reintentos fallan, el
-- recibo pasa al estado terminal FALLIDO y queda para gestión manual.
--
--   PENDIENTE → (reintento +1 → +3 → +7) → FALLIDO
--
-- Si la socia paga más adelante, el recibo pasa a COBRADO por la vía normal.

BEGIN;

-- 1) Cuándo debe el barrido diario reintentar el cobro de este recibo.
--    NULL = sin reintento programado (recién creado sin ciclo, o terminal).
ALTER TABLE public.recibos ADD COLUMN IF NOT EXISTS proximo_reintento timestamptz;

-- 2) Ampliar el CHECK de estado para admitir el estado terminal FALLIDO.
--    Todos los estados existentes ya están en el nuevo conjunto, así que la
--    constraint valida al vuelo (no hace falta NOT VALID).
ALTER TABLE public.recibos DROP CONSTRAINT IF EXISTS recibos_estado_check;
ALTER TABLE public.recibos ADD CONSTRAINT recibos_estado_check
  CHECK (estado = ANY (ARRAY['PENDIENTE','COBRADO','DEVUELTO','EN_CURSO','FALLIDO']));

-- 3) Índice parcial para el barrido de dunning: solo recibos que todavía pueden
--    reintentarse (PENDIENTE con un reintento programado).
CREATE INDEX IF NOT EXISTS idx_recibos_dunning
  ON public.recibos (proximo_reintento)
  WHERE estado = 'PENDIENTE';

-- NOTA: no se hace backfill de los recibos PENDIENTE existentes. El dunning
-- automático aplica solo a los recibos NUEVOS (el código les fija
-- proximo_reintento al crearlos). El backlog previo sigue gestionándose por las
-- vías manuales (Decision OS / Automatizaciones) para no disparar cobros masivos
-- inesperados al desplegar. Si se quiere incorporar el backlog, es un UPDATE
-- deliberado aparte.

COMMIT;
