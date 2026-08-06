-- ─────────────────────────────────────────────────────────────────────────────
-- Una cuenta de Stripe Connect pertenece a UN solo estudio.
--
-- El código ya lo daba por hecho en cinco sitios: `studioDeCuentaConnect`
-- (`app/api/stripe/webhook/route.ts`) resuelve el estudio con `.maybeSingle()`
-- sobre `stripe_account_id`, y las ramas de SEPA, reembolso y disputa dependen
-- de esa resolución para saber de quién es el evento. `.maybeSingle()` LANZA si
-- hay más de una fila, así que dos estudios con la misma cuenta no darían un
-- resultado raro: tumbarían el webhook.
--
-- Hasta ahora era una suposición sin respaldo en el esquema. Pasa a ser carga
-- real con el endurecimiento del guard de tenant en `checkout.session.completed`
-- (lib/billing/webhook-tenant.ts): ese camino ahora RECHAZA si la cuenta no
-- resuelve a un estudio, así que una resolución ambigua dejaría de cobrar dinero
-- legítimo en vez de simplemente registrar mal. Fallar cerrado sobre dinero es
-- lo correcto, pero solo si la invariante está garantizada.
--
-- Índice PARCIAL: `stripe_account_id` es NULL en los estudios que aún no han
-- conectado Stripe (8 de 9 en producción hoy) y los NULL no deben colisionar
-- entre sí.
--
-- Verificado antes de escribir esto: 0 duplicados en producción, así que no hace
-- falta ninguna limpieza previa y la creación no puede fallar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_studios_stripe_account
  ON public.studios (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
