-- tentare-stripe (revisión #canje-codigos-descuento-checkout): la RPC
-- consumir_codigo_descuento (migr 0050) incrementa `usos` sin ninguna clave de
-- deduplicación por pago. Bien pensada contra la concurrencia del POS (dos
-- terminales canjeando A LA VEZ), pero no contra que el webhook de Stripe
-- reprocese el MISMO evento — cosa que sí puede pasar: reclamar_webhook_event
-- (migr 20260730109000) expira su reclamación a los 120s si nadie llega a
-- marcarWebhookProcesado, y `entregarPlanComprado` es idempotente por choque
-- de PK (23505), así que un reintento reentregaría "sin duplicar el bono" pero
-- SÍ volvería a llamar a consumir_codigo_descuento y sumaría usos+1 una
-- segunda vez para la MISMA venta real.
--
-- Se cierra con el mismo patrón compare-and-set que ya usa el repo para
-- dinero (recibos.checkout_session_id, webhook_events): una fila con PK en
-- recibo_id. El primer intento gana con el INSERT; un reintento choca por
-- 23505 y se salta el consumo sin error — igual que entregarPlanComprado ya
-- hace con sus propios ids.
create table if not exists public.codigos_descuento_consumos (
  recibo_id text primary key references public.recibos(id) on delete cascade,
  codigo_id text not null references public.codigos_descuento(id) on delete cascade,
  consumido_en timestamptz not null default now()
);

comment on table public.codigos_descuento_consumos is
  'Compare-and-set: garantiza que un código de descuento se consume UNA sola vez por recibo real, aunque el webhook de Stripe reprocese el mismo evento. Solo lo escribe el webhook (service-role).';

alter table public.codigos_descuento_consumos enable row level security;
-- Sin ninguna policy a propósito (deny-by-default, mismo criterio que
-- widget_eventos/mensajes_entrantes_medicion): solo service_role la toca.
