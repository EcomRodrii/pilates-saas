-- Review Boost: feedback interno al terminar el trial + invitación honesta a
-- reseñar en Capterra/GetApp + recompensa (20% primer mes) desacoplada del
-- clic externo (ver AGENTS/tentare-os.md — cumplimiento Capterra/GetApp/
-- Software Advice: el incentivo no puede condicionarse a una reseña externa).
--
-- Mismo patrón que bienvenida_vista_en/onboarding_descartado_en: flags de
-- "visto una vez" en `studios`, evaluados por un cron (lib/inngest/review-boost.ts).

alter table studios add column review_boost_elegible_en timestamptz;
alter table studios add column review_boost_mostrado_en timestamptz;
alter table studios add column review_boost_pospuesto_en timestamptz;
alter table studios add column review_boost_veces_mostrado smallint not null default 0;

comment on column studios.review_boost_elegible_en is 'Lo marca el cron diario (lib/inngest/review-boost.ts) cuando isEligibleForReviewBoost() da true. NULL = aún no evaluado o no elegible.';
comment on column studios.review_boost_mostrado_en is 'Primera vez que se enseñó el modal. NULL = nunca mostrado.';
comment on column studios.review_boost_pospuesto_en is 'Último cierre sin responder. Junto a veces_mostrado gobierna si se re-muestra (máx. 1 reaparición, 14 días después).';

create table review_boost_feedback (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references studios(id) unique,
  rating smallint not null check (rating between 1 and 5),
  comentario text,
  fuente text not null default 'review_boost',
  -- Solo relevante para feedback negativo (1-3): triage interno de quien lo revisa.
  estado text not null default 'NUEVO' check (estado in ('NUEVO', 'REVISADO')),
  creado_en timestamptz not null default now()
);

comment on table review_boost_feedback is 'Una fila por estudio (unique studio_id): "no volver a pedirlo" queda garantizado por el esquema, no solo por la UI.';

alter table review_boost_feedback enable row level security;

-- Solo la propietaria del estudio ve/escribe su propio feedback (decisión de
-- producto: es sobre la relación con la suscripción de Tentare, no caja
-- diaria — mismo criterio que /configuracion → Facturación, no el de
-- puede_ver_finanzas() que sí incluye RECEPCION).
create policy review_boost_feedback_propietaria_select on review_boost_feedback
  for select using (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');

create policy review_boost_feedback_propietaria_insert on review_boost_feedback
  for insert with check (studio_id = public.current_studio_id() and public.current_rol() = 'PROPIETARIO');

-- Backend-only (service-role, cupón/canje de Stripe): sin RLS de tenant, igual
-- que `penalizaciones` — nunca se lee/escribe desde el navegador.
create table review_boost_recompensas (
  id uuid primary key default gen_random_uuid(),
  studio_id text not null references studios(id) unique,
  feedback_id uuid not null references review_boost_feedback(id),
  stripe_coupon_id text not null,
  concedida_en timestamptz not null default now(),
  -- Se marca al incluir el descuento en un Checkout real (compare-and-set en
  -- app/api/billing/checkout/route.ts) — no espera confirmación de pago.
  -- Límite conocido y aceptado: un checkout abandonado consume la recompensa.
  canjeada_en timestamptz,
  creado_en timestamptz not null default now()
);

comment on table review_boost_recompensas is 'Una recompensa por estudio (unique studio_id). canjeada_en se fija con compare-and-set en el checkout, no en el webhook — ver nota de límite conocido en el plan.';

alter table review_boost_recompensas enable row level security;
-- Sin policies: RLS activa + cero policies = deny-all para authenticated/anon,
-- solo accesible via service-role (mismo patrón que `penalizaciones`).
