-- I-5: Red de recuperación para reembolsos y disputas.
--
-- El webhook de Stripe responde 200 ANTES de procesar reembolsos/disputas en `after()`.
-- Si `procesarEvento` falla, Stripe nunca lo sabe y no reintenta.
--
-- Solución: rastrear qué reembolsos y disputas ya se procesaron, y barrer los perdidos.
-- Mismo patrón que `conciliar-cobros.ts` (entrega lo que se cobró y el webhook no entregó).

-- Tabla para idempotencia de reembolsos: evitar duplicar la devolución del bono
create table if not exists webhook_reembolsos (
  id uuid primary key default gen_random_uuid(),
  pi_stripe_id text not null,
  charge_stripe_id text not null,
  recibo_id uuid,
  amount_refunded_cents integer not null,
  total_charge_cents integer not null,
  es_reembolso_total boolean not null,
  procesado_en timestamptz not null default now(),
  unique(pi_stripe_id, charge_stripe_id)
);

comment on table webhook_reembolsos is 'Rastreo de reembolsos procesados (idempotencia). Si el webhook falla en `after()`, el cron conciliador lo recupera.';

-- Tabla para idempotencia de disputas: evitar duplicar la marca de disputa
create table if not exists webhook_disputas (
  id uuid primary key default gen_random_uuid(),
  pi_stripe_id text not null,
  dispute_stripe_id text not null,
  recibo_id uuid,
  dispute_status text not null,
  procesado_en timestamptz not null default now(),
  unique(pi_stripe_id, dispute_stripe_id)
);

comment on table webhook_disputas is 'Rastreo de disputas procesadas (idempotencia). Si el webhook falla en `after()`, el cron conciliador lo recupera.';

-- Sin RLS: estas tablas son solo para conciliación del servidor, no datos de usuario.
-- `anon`/`authenticated` no debe poder escribir aquí.
revoke all on webhook_reembolsos from authenticated, anon;
revoke all on webhook_disputas from authenticated, anon;
grant select, insert, update on webhook_reembolsos to service_role;
grant select, insert, update on webhook_disputas to service_role;
