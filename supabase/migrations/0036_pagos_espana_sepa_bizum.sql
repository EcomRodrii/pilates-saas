-- 0036_pagos_espana_sepa_bizum.sql
-- Fase 1 · PR-1 (migr. 0036) (solo esquema, additivo, sin lógica).
-- Prepara el terreno para: SEPA Direct Debit recurrente (mandato Stripe) y Bizum
-- real (POS + online) sobre la infraestructura Stripe Connect existente.
-- Decisiones: rail recurrente = Stripe SEPA Direct Debit; Bizum en POS + checkout.
-- Todo ADD COLUMN IF NOT EXISTS (reejecutable) y sin backfill destructivo.

BEGIN;

-- ── socios: método de pago preferido + mandato SEPA ──────────────────────────
-- Stripe gestiona el mandato SEPA; guardamos su id y el payment_method asociado
-- para el cobro off-session recurrente. `metodo_pago_preferido` decide si el
-- cobro recurrente usa la tarjeta on-file (existente) o el mandato SEPA.
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS metodo_pago_preferido text NOT NULL DEFAULT 'TARJETA',
  ADD COLUMN IF NOT EXISTS sepa_mandate_id        text,
  ADD COLUMN IF NOT EXISTS sepa_payment_method_id text;

-- Todas las filas existentes quedan en 'TARJETA' (el default), así que el CHECK
-- valida de inmediato sin NOT VALID.
ALTER TABLE public.socios
  ADD CONSTRAINT socios_metodo_pago_preferido_valido
  CHECK (metodo_pago_preferido IN ('TARJETA', 'SEPA'));

-- ── recibos: método de cobro real + estado asíncrono SEPA ────────────────────
-- SEPA es asíncrono (el resultado tarda días y puede devolverse hasta 8 semanas).
-- `metodo_cobro` registra con qué se cobró; `sepa_estado` sigue el limbo hasta
-- que el webhook confirma succeeded/failed. El estado de negocio del recibo sigue
-- en `recibos.estado` (PENDIENTE/COBRADO/DEVUELTO/EN_CURSO — EN_CURSO ya existía).
ALTER TABLE public.recibos
  ADD COLUMN IF NOT EXISTS metodo_cobro text,
  ADD COLUMN IF NOT EXISTS sepa_estado  text;

ALTER TABLE public.recibos
  ADD CONSTRAINT recibos_metodo_cobro_valido
  CHECK (metodo_cobro IS NULL OR metodo_cobro IN ('TARJETA', 'SEPA', 'BIZUM')) NOT VALID;

-- ── ventas_pos: id de PaymentIntent para conciliar Bizum real ────────────────
-- Cuando el POS cobre Bizum vía Stripe (PaymentIntent), guardamos su id para
-- conciliación. Las ventas 'BIZUM' históricas (etiqueta manual) quedan con NULL.
ALTER TABLE public.ventas_pos
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMIT;
