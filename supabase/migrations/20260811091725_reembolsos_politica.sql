-- ═══════════════════════════════════════════════════════════════════════════
-- Política de reembolsos del estudio + hilo de vuelta a Stripe en el recibo
-- ═══════════════════════════════════════════════════════════════════════════
-- Hasta ahora Tentare solo sabía REACCIONAR a un reembolso: el webhook de
-- `charge.refunded` marca el recibo DEVUELTO, anota la fila en `devoluciones` y
-- ofrece revertir la entrega. Pero el reembolso había que hacerlo a mano en el
-- panel de Stripe — desde Tentare no se podía devolver un euro.
--
-- Esto añade lo que faltaba para poder hacerlo DESDE el panel, con reglas:
--
-- 1) `reembolsos_activos` — apagado por defecto, A PROPÓSITO. Un botón que
--    mueve dinero real no aparece solo: la propietaria decide encenderlo, igual
--    que `penalizacion_importe_eur` (Fase 3) no penaliza a nadie hasta que se
--    configura. Nadie se encuentra un botón de devolver sin haberlo pedido.
--
-- 2) `reembolso_plazo_dias` — días desde el COBRO en los que se puede devolver.
--    0 = sin límite. 14 por defecto (el desistimiento habitual en España para
--    compras a distancia; el estudio puede subirlo o quitarlo).
--
-- 3) `reembolso_solo_sin_usar` — true por defecto: no se devuelve un bono del
--    que ya se han gastado sesiones. Es la regla que evita el caso obvio de
--    "vengo a 3 clases y luego pido el dinero". Quien quiera devolver igualmente
--    puede apagarlo, o hacerlo desde Stripe como hasta hoy.
--
-- Las tres son del ESTUDIO y no tienen override por tipo de clase: un reembolso
-- es sobre un recibo (un bono, un mensual, una cita), no sobre una clase, así
-- que `tipos_clase` no es el sitio. No es el patrón "hereda" de las reglas de
-- reserva — aquí no hay nada de lo que heredar.
--
-- ⚠️ La UI NUNCA es el límite: el endpoint (`app/api/reembolsos`) vuelve a
-- evaluar esta política en el servidor con `evaluarReembolso()`. Estas columnas
-- son la fuente de verdad, no el botón.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.studios
  add column if not exists reembolsos_activos boolean not null default false,
  add column if not exists reembolso_plazo_dias integer not null default 14,
  add column if not exists reembolso_solo_sin_usar boolean not null default true;

comment on column public.studios.reembolsos_activos is
  'Si el estudio permite devolver desde el panel de Tentare. false (default) = el botón no aparece y el endpoint rechaza; se puede seguir devolviendo desde Stripe.';
comment on column public.studios.reembolso_plazo_dias is
  'Días desde fecha_cobro en los que se admite la devolución. 0 = sin límite.';
comment on column public.studios.reembolso_solo_sin_usar is
  'true = no se devuelve un bono con sesiones ya consumidas.';

-- Sin política RLS nueva: son columnas de `studios`, que ya tiene la suya (solo
-- la propietaria/personal de ese estudio lee y escribe su fila). Y quién puede
-- APRETAR el botón no se decide aquí sino en el endpoint, con
-- `puedeMoverDinero(rol)` — mismo criterio que Fase 2a: la RPC/consulta se hace
-- con service-role, donde `auth.uid()` es NULL y una guardia basada en él
-- quedaría bypaseada en silencio.

-- ── El hilo de vuelta a Stripe ───────────────────────────────────────────────
-- `recibos.stripe_payment_intent_id` YA existía (0000_base), pero solo lo
-- escribía la rama SEPA `processing` de `cobrarReciboOffSession`. Ni el cobro
-- con tarjeta que sale bien ni la compra desde el enlace público lo guardaban,
-- así que un recibo COBRADO normalmente NO tenía forma de volver a su cargo en
-- Stripe — y sin eso no hay nada que reembolsar. Se arregla en el código
-- (stripe-cobros.ts y entregar-plan-comprado.ts, en este mismo cambio).
--
-- Los recibos ANTERIORES a este cambio se quedan sin el dato: no se puede
-- rellenar hacia atrás desde SQL porque vive en Stripe, no aquí. Para esos, el
-- endpoint lo busca en Stripe por `metadata.reciboId` antes de rendirse. Este
-- índice es para esa búsqueda inversa y para no repetir un reembolso ya hecho.
create index if not exists idx_recibos_payment_intent
  on public.recibos (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
