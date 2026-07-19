-- ═══════════════════════════════════════════════════════════════════════════
-- 0043 · TENTARE — el CHECK de estado admite 'agotada'
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 0042 introdujo el estado 'agotada' en la lógica (motor de escalado), pero el
-- CHECK constraint `sustituciones_estado_check` de 0037 no lo incluía, así que
-- `UPDATE sustituciones SET estado='agotada'` fallaba con 23514. Aquí se amplía
-- el conjunto permitido. Añadir el estado es un SUPERCONJUNTO del anterior, así
-- que la revalidación de las filas existentes pasa siempre. Reversible: volver a
-- poner el ARRAY sin 'agotada' (posible solo si no hay filas en ese estado).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sustituciones DROP CONSTRAINT IF EXISTS sustituciones_estado_check;

ALTER TABLE public.sustituciones ADD CONSTRAINT sustituciones_estado_check
  CHECK (estado = ANY (ARRAY[
    'buscando'::text,
    'pendiente_aprobacion'::text,
    'contactando'::text,
    'agotada'::text,
    'confirmada'::text,
    'sin_sustituta'::text,
    'resuelta_fuera'::text,
    'cancelada'::text
  ]));
