-- ─────────────────────────────────────────────────────────────────────────────
-- `conciliado_por` admite también el mostrador
--
-- `confirmarCobroRecibo` escribe QUIÉN cerró el cobro, y su CHECK solo conocía
-- 'webhook', 'conciliador' y 'manual'. El cobro de un recibo por el datáfono
-- del TPV es una cuarta fuente, y sin esto la confirmación habría reventado con
-- un 23514 JUSTO DESPUÉS de cobrarle la tarjeta a la socia: dinero cobrado y
-- recibo sin cerrar, que es el peor resultado de los posibles.
--
-- Se prefiere 'tpv' a reutilizar 'manual' porque la diferencia importa al
-- cuadrar: 'manual' es alguien marcándolo a mano sin que ningún proveedor lo
-- confirme; 'tpv' es Stripe diciendo que sí.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.recibos DROP CONSTRAINT IF EXISTS recibos_conciliado_por_check;
ALTER TABLE public.recibos ADD CONSTRAINT recibos_conciliado_por_check
  CHECK (conciliado_por = ANY (ARRAY['webhook','conciliador','manual','tpv']));
