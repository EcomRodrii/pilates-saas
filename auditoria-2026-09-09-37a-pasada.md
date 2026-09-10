# Auditoría 37ª pasada — 2026-09-09

## Área elegida y por qué

**Billing SaaS de la propia plataforma** (`app/api/billing/**`, `lib/billing/
trial.ts`, `lib/billing/entitlements.ts`, `lib/billing/billing-rules.ts`,
`lib/billing/billing-guard.ts`, `lib/billing/catalogo-planes.ts`,
`lib/billing/modo-stripe.ts`, y su superficie en el panel interno
`app/api/interno/estudios/[id]/**`) — Tentare cobrando a los ESTUDIOS por usar
el producto (Stripe Billing, planes BASE/ESTUDIO/CADENA, prueba de 7 días sin
tarjeta), **no** el billing del estudio a sus propias socias (eso ya lo cubren
más de 15 pasadas previas: checkout de planes/matrícula/consentimiento legal,
SEPA/dunning, POS/Bizum, Veri*Factu...).

No estaba en la lista de zonas ya barridas de esta ronda y tiene actividad
reciente real y genuina: la prueba local de 7 días (19-ago), un incidente real
de webhook con secreto desactualizado (22-ago, corregido), y un bug de
producción confirmado y corregido el 2026-09-05 (`trialing` sin fecha de fin =
acceso gratis infinito, migración `20260905213839`). Se leyó el pipeline
completo: los cuatro endpoints de `app/api/billing/` (checkout/portal/status/
webhook), la derivación pura de `estadoTrial()`/`entitlementsDe()`/
`tieneFeature()`, el envoltorio de enforcement (`billing-rules.ts`/
`billing-guard.ts`, hoy detrás de `BILLING_ENFORCED` que sigue apagado en
producción), el trigger de propagación de plan de cadena (migración `0066`) y
la superficie del panel interno que puede tocar `plan`/`suspendido_en` a mano.

**Resultado de la lectura**: la mayor parte de esta zona está ya muy bien
defendida — el guardia de modo Stripe (`modo-stripe.ts`), la idempotencia del
checkout (clave por minuto), el guard anti-doble-suscripción (BASE/ESTUDIO
**y** CADENA, tras el fix de la 19ª auditoría), la reparación reciente del
`trialing` sin fecha, y el webhook con Sentry en cada rama de fallo silencioso
de antes. **No se ha encontrado ningún hallazgo de dinero directo nuevo** en
los caminos ya revisados en pasadas anteriores. Lo que sí es genuino y no
documentado: **el panel interno (`/interno`) no conoce el modelo de cadena**
para las dos operaciones de billing que expone sobre un estudio — un hueco
real, aunque de superficie de soporte/operación más que de robo directo de
dinero.

---

## 🟠 Importante

### 1. `POST /api/interno/estudios/[id]/acciones` (`cambiar-plan`) ignora que el estudio puede ser una sede de cadena — el cambio se revierte solo, sin dejar rastro

**Fichero**: `app/api/interno/estudios/[id]/acciones/route.ts:34-65`

El `SELECT` que carga el estado "antes" de la acción **no lee `cadena_id`**:

```ts
const { data: antes } = await db.from('studios')
  .select('id, slug, nombre, plan, suspendido_en, suspendido_motivo, review_boost_elegible_en')
  .eq('id', id).maybeSingle();
```

Y `cambiar-plan` escribe directo sobre `studios.plan` de esa única fila:

```ts
const { error } = await db.from('studios').update({ plan: cuerpo.plan }).eq('id', id);
```

Pero si ese estudio es una sede de una cadena (`studios.cadena_id` no nulo), el
plan **no vive ahí de verdad** — vive en `cadenas.plan`, y un trigger
(`trg_propagar_plan_cadena`, migración `0066_cadenas_multisede.sql:56-58`)
sobrescribe `studios.plan`/`subscription_status`/`current_period_end` de
**todas** las sedes de esa cadena cada vez que `cadenas` recibe un `UPDATE` en
esas tres columnas — lo cual ocurre en cualquier evento normal de Stripe sobre
la suscripción de la cadena (renovación mensual, cualquier
`customer.subscription.updated`, un cambio de tarjeta que Stripe reporta,
etc.), vía `actualizarSuscripcion()` en el webhook de billing.

**Cómo se explota / cuándo ocurre**: un admin de Tentare (con `studios.update`)
usa "Cambiar plan" para subir a mano a una sede de una cadena (p.ej. gesto
comercial, o para probar algo). El endpoint responde `ok: true`, audita
`estudio.plan.cambiado` con un resumen que suena permanente
("Estudio X: plan BASE → ESTUDIO"), y todo funciona... hasta el siguiente
evento de Stripe sobre la suscripción de esa cadena (puede ser el mismo día si
hay una renovación, o en cualquier `subscription.updated`), momento en el que
el trigger de la migración `0066` pisa silenciosamente ese `plan` con el valor
real de `cadenas.plan` — **sin pasar por este endpoint, sin llamar a
`registrar()`, sin ninguna entrada nueva en la auditoría**. Un soporte que mire
el histórico de auditoría semanas después ve un cambio de plan que nunca se
deshizo formalmente, pero el estudio ya no tiene ese plan.

Es el mismo patrón de bug que ya cerró la 20ª auditoría con el guard de
doble-suscripción de CADENA (F-4): una rama nueva del modelo de negocio
(cadenas) que un camino antiguo no contempla. Aquí el camino antiguo es el
panel interno.

**Arreglo propuesto**: incluir `cadena_id` en el `SELECT` de `antes`; si no es
`null`, rechazar `cambiar-plan` con un 409 explícito ("Esta sede pertenece a
la cadena X — el plan se gestiona sobre la cadena, no sobre la sede") o, si de
verdad hace falta la acción, redirigir la escritura a `cadenas.plan` (lo que
propagaría correctamente a todas las sedes vía el mismo trigger, en vez de
falsear una sola fila que el propio sistema va a corregir).

### 2. La misma ficha 360º miente sobre si el estudio tiene cliente de Stripe, cuando es una sede de cadena

**Fichero**: `app/api/interno/estudios/[id]/route.ts:30-31,83-90`

```ts
const { data: studio } = await db.from('studios')
  .select('id, slug, nombre, plan, email, telefono, direccion, creado_en, stripe_customer_id, stripe_account_id, owner_auth_user_id, ...')
  .eq('id', id).maybeSingle();
...
pagos: {
  tieneClienteStripe: Boolean(studio.stripe_customer_id),
  clienteStripeId: (studio.stripe_customer_id as string | null) ?? null,
  cobraConStripeConnect: Boolean(studio.stripe_account_id),
},
```

Para una sede de una cadena, el `stripe_customer_id` de la **suscripción al
SaaS** vive en `cadenas.stripe_customer_id`, no en `studios.stripe_customer_id`
(ver `app/api/billing/checkout/route.ts:153-162` y
`app/api/billing/portal/route.ts:30-33`, que ya conocen esta distinción). La
ficha 360º del panel interno no consulta `cadenas` en ningún punto, así que
para cualquier sede de una cadena que SÍ está pagando de verdad,
`tieneClienteStripe` sale `false` y `clienteStripeId` sale `null`.

**Cómo se explota / cuándo ocurre**: un agente de soporte abre la ficha de una
sede de cadena que factura con normalidad, ve "sin cliente de Stripe" y
concluye — incorrectamente — que el estudio no está pagando o que hay un
problema de cobro que investigar, sin tener forma de encontrar el
`customer_id` real (el de la cadena) desde esta pantalla para mirarlo en el
dashboard de Stripe.

**Arreglo propuesto**: si `studio.cadena_id` no es nulo y
`studio.stripe_customer_id` es nulo, hacer el fallback a
`cadenas.stripe_customer_id` (mismo patrón exacto que ya usan `checkout` y
`portal`), y devolver también un flag `facturaComoCadena: true` para que la UI
lo distinga de un estudio individual sin cliente de Stripe todavía.

---

## 🟡 Menor

### 3. `invoice.payment_failed` puede reenviar el aviso de fallo de pago una vez por cada reintento de Stripe, sin deduplicar por suscripción

**Fichero**: `app/api/billing/webhook/route.ts:115-127`, `avisarFalloPagoSaas` (líneas 243-270)

La idempotencia (`reclamarWebhookEvent`) es por `event.id`, así que no evita
reenvíos: Stripe emite un `invoice.payment_failed` **distinto** (con su propio
`event.id`) en cada reintento de cobro de una factura de suscripción (suele
ser varios a lo largo de ~2 semanas). Cada uno dispara un email nuevo a la
propietaria vía `enviarEmailFalloPagoSaas`. No hay guardia de "ya se avisó de
este ciclo de facturación" (algo como comprobar `invoice.id` o
`invoice.attempt_count` contra lo último enviado).

No está claro que sea indeseado — cada intento fallido real es información
nueva y legítima ("va a reintentarse el día X") — pero si el criterio de
producto era "un aviso, no un goteo", falta esa deduplicación. Se marca como
menor porque no hay evidencia de que se haya quejado ninguna propietaria ni de
que el criterio de producto exigiera un único aviso; es una observación, no un
bug confirmado por el comportamiento esperado.

**Arreglo propuesto (si se decide que un aviso por ciclo es lo correcto)**:
guardar `ultimo_aviso_fallo_pago_invoice_id` (o similar) en `studios`/`cadenas`
y comparar contra `invoice.id` antes de reenviar.

---

## Qué NO se encontró (y se comprobó explícitamente)

- El guard de modo Stripe (`comprobarModoStripe`) está en las dos puertas de
  cobro de esta zona (`/api/billing/checkout` y, por herencia, el resto de
  `cobrarReciboOffSession`/`/api/stripe/checkout` ya auditados) — no hace
  falta añadirlo en ningún sitio nuevo.
- El guard anti-doble-suscripción cubre BASE/ESTUDIO y CADENA por igual (fix
  de la 19ª auditoría, verificado leyendo el código actual, no solo el
  comentario).
- La idempotencia del `checkout.sessions.create` (clave por minuto,
  estudio+plan / cadena+plan) sigue en su sitio en ambas ramas.
- El webhook de billing distingue correctamente eventos `mode: 'payment'`
  (compra de socia, no suscripción) del propio dominio, y ya no traga en
  silencio ninguna firma inválida.
- La reparación del `trialing` sin `trial_ends_at` (bug real de producción,
  35 días de acceso gratis en un CADENA) está cerrada tanto en el dato
  (migración `20260905213839`) como en la derivación (`estadoTrial()`).
- `BILLING_ENFORCED` sigue apagado en producción (documentado, decisión
  deliberada) — todas las reglas de `billing-rules.ts` fallan abierto hoy;
  esto es consistente con lo que ya dice `.claude/tentare-os.md` y no es un
  hallazgo nuevo.
- El cupón de Review Boost aplicado en el checkout de suscripción usa
  compare-and-set (`.is('canjeada_en', null)`) correctamente contra una
  carrera de doble clic.

No se ha forzado ningún hallazgo adicional de baja confianza para completar
cupo: el resto de la zona (portal de Stripe, catálogo de planes derivado de
entitlements, entornos live/test) está sólido.
