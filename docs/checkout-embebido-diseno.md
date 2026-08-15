# Fase 3 — Checkout embebido en el widget (Modo B): diseño técnico

> Estado del repo auditado: `origin/main` @ `89cf1b53` (14 ago 2026). Este documento
> es una fotografía para decisión, no código — la implementación es un paso posterior,
> condicionado a que `tentare-stripe`/`tentare-seguridad` firmen §9.
>
> Continúa directamente de `docs/booking-engine-architecture.md` (Fase 0, §3.4):
> el hallazgo de que hoy no existe checkout embebible — solo Stripe Checkout
> hospedado con redirect de página completa — y que este es el cambio de
> arquitectura de mayor riesgo de todo el plan "Booking Experience Engine".

## 0. El problema, en una frase

Hoy `POST /api/stripe/checkout` (`app/api/stripe/checkout/route.ts`) crea una
`checkout.sessions.create()` y el cliente hace `window.location.href = session.url`
— eso saca a la clienta de la web del estudio, entra en `checkout.stripe.com`, y
solo vuelve si Stripe hace el redirect de éxito. En Shadow DOM (Modo B) no hay
iframe del que "escapar" (`window.top === window` siempre), pero el problema de
fondo —abandonar la web del estudio— es el mismo. La solución es sustituir
Checkout Session por **PaymentIntent + Stripe Elements (Payment Element)**
montado dentro del propio Shadow Root, con `redirect: 'if_required'`.

**Decisión de alcance, ya tomada por la auditoría de Fase 0 y que este diseño
respeta**: esto es checkout de **compra de plan** (`planes_tarifa`, guest o con
socia), el mismo caso que hoy cubre `body.planId` en `checkout/route.ts:96-131`.
No rediseño el cobro de un recibo pendiente desde el panel (`body.reciboId`) —
ese sigue viviendo en Checkout Session, sin tocar (§8).

## 1. API nueva de creación de intención de pago

### `POST /api/public/checkout-embebido`

Vive junto al resto de `/api/public/*` (service-role, sin RLS, autorización a
mano — mismo patrón documentado en la auditoría §1). Recibe:

```ts
{ studioId: string; planId: string; socioId?: string | null;
  socioEmail?: string | null; socioNombre?: string; origenLead?: string | null }
```

Nunca `importe`. La validación server-side es **exactamente** la misma que ya
existe en `checkout/route.ts:96-131` (recorto, no reescribo):

1. `comprobarModoStripe()` — mismo guardia que las 5 puertas ya documentadas
   (`lib/billing/modo-stripe.ts`). Este es la sexta.
2. Rate limit — ver §7.
3. `planes_tarifa` leído por `id` + `.eq('studio_id', studioId)`, `activo=true`
   → importe y concepto salen de ahí, nunca del body.
4. Si `!socioId` y `compra_publica_modo === 'EXIGIR_REGISTRO'` (default,
   `lib/db-types.ts:635`) → 409 con `necesitaRegistro: true`, igual que hoy.
5. `studios.stripe_account_id` obligatorio (sin cuenta conectada, 409).

Diferencia con hoy: en vez de `stripe.checkout.sessions.create()`, crea
directamente

```ts
stripe.paymentIntents.create({
  amount: Math.round(importe * 100),
  currency: 'eur',
  payment_method_types: ['card'],               // explícito, no automatic — ver nota Bizum abajo
  setup_future_usage: 'off_session',             // igual que hoy sin Bizum
  application_fee_amount: fee,                   // applicationFeeAmount() reutilizado tal cual
  metadata: { studioId, planId, socioId, origenLead, origen: 'plan_web_embebido' },
}, {
  stripeAccount: studio.stripe_account_id,
  idempotencyKey: `checkout-embebido-${studioId}-${planId}-${socioId ?? 'guest'}-${ventanaMinuto()}`,
});
```

y responde `{ clientSecret: paymentIntent.client_secret }`.

**Nota sobre `payment_method_types` vs `automatic_payment_methods`**: se fija
explícito a `['card']` en vez de dejar que Stripe decida automáticamente —
Bizum es un método con acción externa (redirect a la app del banco) que
rompería "nunca sale del widget", así que se excluye a propósito del
Payment Element; va aparte (§4). Fijarlo explícito es también la salvaguarda
si Stripe añade métodos nuevos a `automatic_payment_methods` sin aviso (ver §9.3).

**Idempotencia, mejora respecto al camino existente**: a diferencia de
`checkout.sessions.create()` (que hoy no pasa `idempotencyKey` — dos pestañas
pueden generar dos sesiones pagables del mismo intento), este endpoint nuevo
SÍ la lleva desde el primer día, derivada de `(studioId, planId, socioId,
ventana de tiempo)`. Es una decisión de diseño nueva, no una paridad con lo
existente — señalarlo así a `tentare-stripe` (§9.4).

`metadata.origen = 'plan_web_embebido'` es el nuevo valor que hay que añadir a
`ORIGENES_CON_RECIBO` (`app/api/stripe/webhook/route.ts:24`, hoy
`{'sepa_recibo', 'tarjeta_recibo', 'plan_web'}`) — la lista ya tiene un
comentario explícito de que olvidarlo aquí deja reembolsos/disputas ciegos a
este origen, así que es literalmente el checklist a seguir, no una nota aparte.

## 2. Confirmación en el cliente — Stripe Elements dentro del Shadow Root

`app/widget-bundle/main.tsx` monta hoy `<ReservaCalendario>` en `raiz` dentro de
un `shadow.attachShadow({ mode: 'open' })` (líneas 68-82). El checkout añade un
componente nuevo, `<CheckoutEmbebido plan={...} clientSecret={...}>`, montado
en el mismo árbol React — no un segundo `createRoot` ni un segundo Shadow Root.

- `loadStripe(pk, { stripeAccount })` + `<Elements options={{ clientSecret,
  appearance: {...} }}>` + `<PaymentElement/>` de `@stripe/react-stripe-js`
  (dependencia nueva, no presente hoy en el bundle — impacto en tamaño a medir
  cuando se implemente, junto al code-splitting que la auditoría de Fase 0 ya
  señaló como deuda pendiente del bundle).

  **Riesgo a validar con spike, no asumido**: Stripe.js internamente crea sus
  propios `<iframe>` para PCI-DSS — eso es correcto y necesario (no se evita),
  pero un iframe dentro de un Shadow Root abierto en el DOM de un dominio de
  terceros con CSP que Tentare no controla no está probado en este repo.
  **Spike de una tarde antes de escribir código de producción**: cargar
  `@stripe/stripe-js` dentro de un shadow root montado sobre una página de
  prueba con CSP restrictiva (`frame-src`, `connect-src` explícitos) y
  confirmar que el iframe de Stripe monta y que el `client_secret` viaja sin
  bloqueo de `connect-src`. Si el estudio tiene su propia CSP sin
  `js.stripe.com`/`hooks.stripe.com`, el checkout falla en silencio en SU
  web — esto necesita, como mínimo, documentación para el estudio (mismo
  criterio que hoy exige añadir el dominio a `widget_dominios_autorizados`).

- `appearance` del Payment Element se alimenta de las mismas custom properties
  que ya inyecta `montarUno` (`--portal-brand`, línea 74 de `main.tsx`) — no un
  tema nuevo, el mismo puente mínimo que ya usa el resto del bundle.
- Confirmación: `stripe.confirmPayment({ elements, confirmParams: { return_url },
  redirect: 'if_required' })`. Con `if_required`, si no hace falta 3DS ni ningún
  método con redirect, Stripe **no navega** — resuelve la promesa en el mismo
  contexto y el widget sigue montado. `return_url` es obligatorio en la API
  pero solo se usa si Stripe decide que SÍ hace falta salir (§3) — apunta a
  `/reservar/[slug]?embed_retorno=1` (una vista mínima ya existente en Modo A,
  no una pantalla nueva) por si ese camino se dispara.

## 3. 3DS — resuelto con el modal nativo, no con el mensaje de error de hoy

`lib/billing/stripe-cobros.ts:222-226` hoy devuelve explícitamente "pídele que
pague desde un enlace de cobro normal" porque es un cobro **off-session** — la
socia no está presente para autenticar. Aquí sí está presente, así que 3DS se
resuelve distinto: `confirmPayment` con `redirect: 'if_required'` abre el modal
de autenticación de Stripe **dentro del propio flujo** — es otro iframe que
Stripe.js inyecta a demanda (mismo mecanismo PCI que el Payment Element, no un
componente nuevo que construir). Mientras está abierto, la promesa de
`confirmPayment` sigue pendiente; el widget debe:

- Deshabilitar el botón de pago (ya lo exige el patrón de Turnstile,
  `.claude/tentare-os.md` — "todo formulario debe encender su estado de carga
  antes de esperar" — mismo criterio, otro proveedor).
- El modal de Stripe se posiciona con `z-index` relativo al **documento**, no
  al Shadow Root — a validar en el mismo spike de §2 que no quede tapado por
  CSS del estudio anfitrión con z-index alto (un banner de cookies, un chat
  widget).

Si `confirmPayment` devuelve `paymentIntent.status === 'requires_action'` sin
resolver dentro del widget (banco con 3DS que exige salir, poco común pero
existe), ahí sí se usa `return_url` y se navega — es el único camino de escape
legítimo, documentado como tal en la UI ("puede que tengas que confirmar en tu
banco, se abrirá una pestaña").

## 4. Bizum — fallback con redirect explícito, no en el flujo embebido

Bizum no cabe en `redirect: 'if_required'` sin salir (acción externa en la app
del banco). Se mantiene como **botón alternativo** junto al Payment Element:
"Pagar con Bizum" sigue llamando al `/api/stripe/checkout` **existente** con
`{bizum: true}` (`checkout/route.ts:168-199`, sin tocar) y hace el
`window.location.href = session.url` de siempre — pero con un aviso previo
explícito en el widget ("Se abrirá una pestaña de Stripe para completar el
pago con Bizum"), que hoy no existe en ningún camino. Dos rutas de pago
coexistiendo a propósito: tarjeta embebida (nueva), Bizum con redirect
avisado (reutiliza lo que ya hay). No se intenta forzar Bizum dentro del
Payment Element.

## 5. Webhook — nuevo origen, misma forma que SEPA/POS, sin tocar Checkout Session

El evento que confirma el pago pasa de `checkout.session.completed` a
`payment_intent.succeeded` **para este origen concreto**. El handler ya existe
(`app/api/stripe/webhook/route.ts:470-541`) y ya rama por `pi.metadata?.origen`
(`'pos_terminal'`, `'pos_bizum'`, `'sepa_recibo'`) — se añade una rama más, no
un manejador nuevo:

```ts
if (pi.metadata?.origen === 'plan_web_embebido') {
  const studioId = await studioDeCuentaConnect(admin, event.account); // mismo patrón que SEPA, línea ~510
  if (!tenantAutorizado(studioId, pi.metadata.studioId)) { /* 403, mismo criterio */ }
  const { entregarPlanComprado } = await import('@/lib/billing/entregar-plan-comprado');
  const entrega = await entregarPlanComprado(admin, {
    sessionId: pi.id,          // ← el cambio real, ver abajo
    studioId, planId: pi.metadata.planId,
    socioId: pi.metadata.socioId ?? null,
    email: pi.metadata.socioEmail ?? null, nombre: pi.metadata.socioNombre ?? null,
    importeCobradoCentimos: pi.amount_received ?? pi.amount ?? null,
    paymentIntentId: pi.id,
    origenLead: pi.metadata.origenLead ?? null,
  });
  // + guardarCaducidadTarjeta, emitirPagoRealizado, enviarEmailReciboWebhook — mismos best-effort de checkout.session.completed
}
```

**Cambio exacto en `lib/billing/entregar-plan-comprado.ts`**: `idsDe()`
(líneas 76-84) hoy solo acepta `sessionId` con prefijo `cs_`. Se generaliza el
parámetro a un identificador de origen genérico (renombrar `sessionId` → algo
como `idOrigen`, o añadir un segundo parámetro `prefijoEsperado` si se
prefiere no tocar la firma) y se ajusta el regex
`replace(/^cs_(test_|live_)?/, ...)` para también aceptar `pi_(test_|live_)?`
— **sin quitar el camino de `cs_`**, Modo A sigue generando Checkout Sessions
y necesita seguir derivando de `session.id` tal cual. El comentario de la
función ya avisa de que el conciliador (`lib/inngest/conciliar-cobros.ts`)
depende de esta regla — cualquier cambio aquí necesita revisar ese
conciliador también, no solo el webhook.

**No se toca** `checkout.session.completed` (líneas 179-330) ni su rama de
`planId` — Modo A sigue funcionando exactamente igual.

## 6. Guardado de tarjeta

Hoy se lee del PaymentIntent **expandido de la Checkout Session**
(`session.payment_intent`, líneas ~280-290 del webhook, vía
`guardarCaducidadTarjeta`). Con PaymentIntent directo, el propio evento
`payment_intent.succeeded` YA es el PaymentIntent — no hace falta expandir
nada, se llama `guardarCaducidadTarjeta(admin, stripe, { socioId, studioId,
paymentMethodId: pi.payment_method as string, stripeAccount: event.account })`
directamente con el `pi` del evento. Es **menos** trabajo que el camino
actual, no más — un efecto colateral favorable de pasar a PaymentIntent
directo. `stripe_customer_id` sale de `pi.customer` (con
`setup_future_usage: 'off_session'` puesto en la creación, Stripe crea/reutiliza
el Customer automáticamente igual que hace hoy `customer_creation: 'always'`
en Checkout Session).

## 7. CORS y rate limiting

**CORS**: `POST /api/public/checkout-embebido` se añade a la lista de rutas
que usan `respuestaPreflightWidget`/`conCorsWidget` (`lib/cors-widget.ts`),
exigiendo `?slug=` o `?studioId=` en la query — mismo patrón que el resto (el
preflight OPTIONS no lleva body). El endpoint YA está bajo `/api/public/*`,
así que el service-role y la ausencia de RLS son coherentes con el resto de
esa carpeta.

**Rate limit**: el límite actual de `stripe-checkout` es `10/60s`
(`checkout/route.ts:22`), dimensionado para "un click, una sesión". Un
checkout embebido tiene más idas y vueltas por el mismo intento legítimo
(crear intent → posible reintento de 3DS → posible cambio de método de pago
sin recargar) — un límite de 10/60s por IP se queda corto para un solo pago
con fricción real, pero sigue siendo razonable para bloquear abuso. La
corrección no es subir el máximo sino separar la clave del límite: bucket
nuevo `'checkout-embebido'` con `max: 15, windowSeconds: 120` (más ventana, no
más generosidad por minuto) para no confundir reintentos legítimos de 3DS con
un ataque. `'stripe-checkout'` (Checkout Session/Bizum) se queda tal cual.
Cifra final a confirmar con `tentare-seguridad` (§9) — es una propuesta, no un
número cerrado unilateralmente.

## 8. Coexistencia con Modo A

**Confirmado explícitamente: `/reservar/[slug]` (iframe, Checkout Session con
redirect) no se toca ni se retira.** Nada de este diseño modifica
`checkout/route.ts` ni la rama `checkout.session.completed` del webhook — el
endpoint nuevo (`checkout-embebido`) y el evento nuevo
(`payment_intent.succeeded` con `origen: 'plan_web_embebido'`) son
**aditivos**. Un estudio puede tener el widget Modo A funcionando y el Modo B
con checkout embebido activo a la vez sin conflicto: comparten
`entregarPlanComprado` pero con ids de idempotencia derivados de prefijos
distintos (`cs_` vs `pi_`), así que nunca colisionan entre sí.

## 9. Riesgos que `tentare-stripe`/`tentare-seguridad` deben firmar antes de implementar

Concreto, no genérico:

1. **Spike de Shadow Root + CSP de terceros (§2)** — antes de escribir una
   sola línea de `<Elements>`. Sin esto, todo lo demás es papel.
2. **`execute_sql`+`ROLLBACK` sobre `idsDe()` con el regex ampliado**: probar
   con un `sessionId` real tipo `cs_test_...` y un `paymentIntentId` real tipo
   `pi_test_...` que ambos produzcan slugs distintos y sin colisión — el
   riesgo concreto es que un `pi_` truncado a 24 caracteres choque por
   casualidad con un `cs_` truncado de otra compra (probabilidad baja pero no
   cero, y la PK es la única defensa).
3. **Confirmar en modo test que `payment_method_types: ['card']` fijo excluye
   Bizum de forma robusta** — verificar con una llamada real en modo test que
   la API respeta ese valor y no ofrece Bizum en el Payment Element pase lo
   que pase con el resto de configuración de la cuenta Connect.
4. **Idempotencia de creación del PaymentIntent**: a diferencia de Checkout
   Session (que hoy no pasa `idempotencyKey`, así que dos pestañas pueden
   generar dos sesiones pagables del mismo intento — hallazgo aparte, no
   arreglado por este diseño), este endpoint nuevo lleva `idempotencyKey`
   desde el primer día (§1). Confirmar con `tentare-stripe` que la clave
   propuesta (`studioId+planId+socioId+ventana de minuto`) es suficientemente
   específica sin bloquear compras legítimas consecutivas (p. ej. dos
   personas comprando el mismo plan a la vez desde IPs distintas — la clave
   NO debe incluir IP, y no la incluye).
5. **Gotcha de grants no aplica aquí** (no hay RPC nueva de Postgres en este
   diseño — todo el checkout vive en TypeScript/Stripe), pero si en
   implementación aparece cualquier función SQL de apoyo, aplica el gotcha de
   grants ya documentado tres veces en este repo sin excepción
   (`REVOKE ... FROM PUBLIC` + `GRANT` explícito + `has_function_privilege`).
6. **Verificar en modo test que el modal de 3DS no queda atrapado por un
   `focus-trap` de un componente ajeno del estudio** (banner de cookies con
   su propio `inert`/`aria-modal`) — riesgo de UX, no de seguridad, pero
   bloqueante para el lanzamiento si un estudio real lo golpea.

## 10. Qué NO se aborda en esta fase de diseño

- **Apple Pay / Google Pay** dentro del Payment Element — técnicamente los
  habilitaría `automatic_payment_methods`, pero exigen verificación de
  dominio del ESTUDIO ante Stripe (`domain association file` servido desde SU
  dominio, que Tentare no controla). Esta fase fija `payment_method_types`
  explícito a `['card']` precisamente para no abrir esa puerta sin diseñarla.
- **Cobro directo de recibo pendiente (`body.reciboId`) desde el widget** — el
  endpoint nuevo es solo para `planId`; el camino de recibo sigue en Checkout
  Session sin cambios.
- **SEPA desde el widget embebido** — el mandato SEPA hoy es un flujo
  `mode: 'setup'` con redirect (`webhook/route.ts:194-215`); embeberlo es un
  proyecto aparte, no incluido aquí.
- **Login/registro dentro del checkout** — este diseño asume que la
  resolución de `socioId`/guest ya viene resuelta por la Fase 2 (Auth) del
  plan mayor; no rediseña el problema de sesión-en-Shadow-DOM ya señalado en
  `docs/booking-engine-architecture.md` §3.1.
- **Migración de base de datos** — no hace falta ninguna para esta fase (ni
  tabla nueva ni columna nueva). Si el spike de §2 revela que hace falta
  registrar algo (p. ej. un log de intentos de checkout embebido para
  diagnóstico), se numera después del último migration existente en el
  momento de implementar (`ls supabase/migrations | tail -1` o
  `list_migrations` — no confiar en ningún número citado en este documento si
  ha pasado tiempo).
- **Analítica nueva de este flujo** — reutiliza el catálogo existente
  (`checkout_started`, `booking_completed`) sin tipos de evento nuevos; si la
  Fase 8 (CRO/Analytics) necesita distinguir "checkout embebido" de "checkout
  Bizum con redirect" en las métricas, es una decisión de esa fase, no de
  esta.

---

**Resumen de una frase**: diseño de checkout embebido en el widget (Fase 3 del
Booking Experience Engine) — sustituye Stripe Checkout hospedado por
PaymentIntent + Payment Element dentro del Shadow Root, sin tocar el flujo
existente de Modo A ni la lógica de entrega de planes, con Bizum y
recibo-pendiente quedando fuera de alcance a propósito.
