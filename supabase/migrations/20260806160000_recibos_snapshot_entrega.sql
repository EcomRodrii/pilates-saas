-- ─────────────────────────────────────────────────────────────────────────────
-- Qué entregó cada cobro, guardado en el momento de entregarlo.
--
-- Hoy, cuando se devuelve el dinero (reembolso o chargeback perdido), el recibo
-- pasa a DEVUELTO y nada más: la socia se queda con el bono recargado o con el
-- mes extendido. Para poder OFRECER deshacerlo hace falta saber qué se cambió,
-- y eso hoy se pierde: `suscripciones` no tiene `updated_at`, ni triggers, ni
-- histórico de sesiones. El saldo es un contador destructivo.
--
-- ⚠️ Se guarda el ANTES **y el DESPUÉS**, no solo el antes. El después es lo que
-- permite responder la única pregunta que hace segura una reversión: ¿ha tocado
-- alguien la suscripción desde la entrega? Si lo que hay hoy no coincide con lo
-- que dejó la entrega, es que la movió una congelación (migr 0079), otra
-- renovación o un ajuste a mano — y entonces la reversión ya no es exacta y no
-- debe proponerse. Sin el después eso es indetectable.
--
-- Va en `recibos` y no en una tabla aparte porque el recibo YA es la tabla del
-- ciclo de vida del cobro (`fecha_cobro`, `sepa_estado`, `disputa_estado`,
-- `proximo_reintento`, `intentos_reintento`, `stripe_payment_intent_id`): la
-- entrega es un atributo más, 1:1 de verdad. Y su RLS ya es exactamente la que
-- hace falta — `recibos_lectura` usa `puede_ver_finanzas()`, que deja fuera a
-- MANAGER. Una tabla nueva serían cuatro políticas más que mantener.
--
-- Sin backfill a propósito: por Stripe no ha pasado ni un euro en producción,
-- así que no hay nada que rellenar hacia atrás. `entrega_aplicada` NULL
-- significa "no lo sé" (cobro anterior a esto, o camino no instrumentado), y es
-- la verdad — distinto de `false`, que significa "se evaluó y no cambió nada".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS entrega_tipo text
    CHECK (entrega_tipo IS NULL OR entrega_tipo IN ('BONO', 'MENSUAL', 'ALTA_WEB', 'NINGUNA')),
  ADD COLUMN IF NOT EXISTS entrega_aplicada boolean,
  ADD COLUMN IF NOT EXISTS entrega_aplicada_en timestamptz,
  ADD COLUMN IF NOT EXISTS entrega_sesiones_antes integer,
  ADD COLUMN IF NOT EXISTS entrega_sesiones_despues integer,
  ADD COLUMN IF NOT EXISTS entrega_fecha_fin_antes date,
  ADD COLUMN IF NOT EXISTS entrega_fecha_fin_despues date,
  ADD COLUMN IF NOT EXISTS entrega_estado_antes text,
  ADD COLUMN IF NOT EXISTS importe_devuelto numeric(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.recibos.entrega_tipo IS
  'Qué clase de entrega disparó este cobro. NINGUNA = el recibo no cuelga de ninguna suscripción (p. ej. una penalización). NULL = cobro anterior a esta instrumentación.';
COMMENT ON COLUMN public.recibos.entrega_aplicada IS
  'true = la renovación cambió algo. false = se evaluó y NO cambió nada (bono que aún tenía saldo, mensual ya extendido). NULL = no se sabe: cobro anterior a esta instrumentación. Los tres significan cosas distintas y ninguno se puede inferir de los otros.';
COMMENT ON COLUMN public.recibos.entrega_estado_antes IS
  'Estado de la suscripción ANTES de entregar. Las dos ramas de la renovación pisan `estado` a ACTIVA sin leerlo, así que sin esto no se puede restaurar (un bono agotado podía estar EXPIRADA, o PAUSADA por congelación).';
COMMENT ON COLUMN public.recibos.entrega_fecha_fin_despues IS
  'Lo que la entrega DEJÓ. Se compara contra la suscripción actual para detectar si alguien la ha tocado desde entonces; si no coincide, la reversión ya no es exacta.';
COMMENT ON COLUMN public.recibos.importe_devuelto IS
  'Acumulado devuelto (reembolsos parciales incluidos), en euros. Se escribe con el valor ABSOLUTO que da Stripe en `charge.amount_refunded`, no incrementando, así que un reintento del webhook es idempotente. De paso arregla que los informes contaran el íntegro de un recibo parcialmente reembolsado.';
