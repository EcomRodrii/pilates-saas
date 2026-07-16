-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 · M10 · Idempotencia de webhooks por event.id
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO (auditoría 15-jul, hallazgo M10)
-- Los webhooks de Stripe (app/api/stripe/webhook, app/api/billing/webhook) eran
-- idempotentes a nivel de OPERACIÓN (upserts, PK por payment_intent…), lo cual es
-- aceptable, pero Stripe puede RE-ENTREGAR el mismo evento (reintentos, entregas
-- duplicadas). Una tabla de `event.id` ya procesados hace el manejo robusto: se
-- salta un evento SOLO si ya se procesó con éxito.
--
-- Se marca DESPUÉS de procesar OK (nunca antes): si el handler falla y devuelve
-- 5xx, el evento NO queda marcado y el reintento de Stripe se reprocesa (no se
-- pierde un pago). Solo lo toca el servidor con service_role → RLS + REVOKE anon
-- en esta misma migración (lección de C1/C2).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.webhook_events (
  id          text primary key,          -- Stripe event.id (evt_…)
  tipo        text,                       -- event.type, para depurar
  recibido_en timestamptz not null default now()
);

alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from anon, authenticated, public;

create index if not exists webhook_events_recibido_en on public.webhook_events (recibido_en);

-- LIMPIEZA (follow-up, no bloqueante): purga de eventos viejos, p. ej.
--   delete from public.webhook_events where recibido_en < now() - interval '30 days';
-- Stripe no reintenta pasados ~3 días, así que 30 días es holgado.
