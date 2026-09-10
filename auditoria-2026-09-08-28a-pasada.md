# Auditoría 28ª pasada — 2026-09-08

Alcance: revisión centrada en el commit más reciente de la rama (`265afd2c`,
"fix(pos): P-1/P-2/P-3, Bizum del mostrador — checkout session, backstop de
fallo, método real", #1764), que es la corrección de dinero más nueva del
repo y toca exactamente el área de esta rama de trabajo
(`fix/pos-bizum-doble-cobro`). Contrastado contra `tentare-os.md` y las
auditorías `auditoria-2026-08-26.md` … `auditoria-2026-09-07.md` para no
repetir hallazgos ya cerrados. Se revisó también, de forma más superficial,
el resto de `git log --oneline -60` sin encontrar nada adicional que no
estuviera ya cubierto por pasadas anteriores o marcado como decisión cerrada
en `tentare-os.md`.

**No se ha aplicado ningún fix — solo el informe, como se pidió.**

---

## 🟠 Hallazgo 1 — P-3 (27ª pasada) no cierra el camino que gana casi siempre: el desglose de método de un RECIBO sigue mintiendo

**Ficheros:** `app/api/pos/recibo/confirmar/route.ts:120` (recorre de
`lib/pos/cliente.ts:194-206`), frente a
`app/api/stripe/webhook/route.ts:733-751` (rama `reciboIdPos` de
`payment_intent.succeeded`).

El commit #1764 arregla P-3 ("el desglose de método miente") **solo dentro
del webhook**: cuando llega `payment_intent.succeeded` con `reciboId` en la
metadata, ahora sí hace `stripe.charges.retrieve(...)` y decide
BIZUM/TARJETA por `payment_method_details.type` real, en vez de fiarse del
origen (`pos_bizum`).

Pero el cobro de un recibo en el mostrador tiene **dos caminos que se
disputan quién cierra el recibo primero** (el propio comentario de
`confirmar-cobro.ts` lo dice: "puede llegar por dos caminos a la vez"): el
sondeo síncrono del navegador (`POST /api/pos/recibo/confirmar`, cada pocos
segundos mientras el mostrador tiene la pantalla abierta) y el webhook. El
`UPDATE ... WHERE estado IN (...)` de `confirmarCobroRecibo`
(`lib/billing/confirmar-cobro.ts:84-123`) es un compare-and-set: **quien
llega primero** escribe `metodo_cobro` y el segundo ya no toca la fila
(0 filas afectadas, `metodo_cobro` no se corrige nunca después).

En el camino síncrono (`app/api/pos/recibo/confirmar/route.ts:120`), el
valor que se escribe es:

```ts
metodoCobro: metodo === 'DATAFONO' ? 'TARJETA' : metodo,
```

donde `metodo` es el parámetro que **manda el cliente** en el body
(`lib/pos/cliente.ts:194-206`, `cobrarReciboEnMostrador(reciboId, metodo)` —
literalmente el mismo botón que pulsó quien cobra, "Bizum" o "Datáfono", NO
lo que Stripe dice haber cobrado). Es exactamente el mismo defecto que P-3
decía haber cerrado: la sesión de Bizum del mostrador acepta
`['card', 'bizum']` (#1744), así que una clienta puede pagar con tarjeta un
cobro lanzado como "Bizum", y este camino sigue grabando `BIZUM` sin mirar
el cargo real.

Y este es el camino que **gana casi siempre**: el mostrador sondea con el
navegador abierto en cuanto lanza el cobro, mientras que el webhook de
Stripe suele tardar más en llegar y entregarse. El arreglo de P-3 solo se
activa en el caso raro que el propio código documenta como backstop (el
navegador se cerró a mitad del cobro y solo llega el webhook) — es decir,
P-3 quedó corregido en el camino que casi nunca gana la carrera, y sigue
roto en el que gana casi siempre.

**Cómo se reproduce:** en el mostrador, lanzar un cobro de recibo por Bizum
(bandeja de "Deudas"/recibos), pagar el enlace CON TARJETA desde el móvil
(la sesión lo permite), sin cerrar la pestaña del mostrador. El sondeo
síncrono detecta `PAGADO` y cierra el recibo con `metodo_cobro = 'BIZUM'`
aunque el cargo real haya sido `card`. El arqueo por método (`porMetodo` en
`app/api/pos/catalogo/route.ts:64-70`, que agrupa por la columna cruda)
sigue descuadrado igual que antes del fix.

**Arreglo propuesto:** mover la derivación real (`stripe.charges.retrieve` +
`payment_method_details.type`) a un sitio común que usen los dos caminos —
lo más simple es hacerlo dentro de `recibo/confirmar/route.ts` cuando
`est.estado === 'PAGADO'`, igual que ya hace el webhook, en vez de confiar en
el `metodo` que manda el body. El parámetro `metodo` del cliente puede
seguir sirviendo para elegir el PROVEEDOR (`proveedorPara(metodo, ...)`),
pero no debería ser lo que se graba como `metodo_cobro` cuando el proveedor
es Bizum (que acepta los dos medios).

---

## 🟠 Hallazgo 2 — El mismo "método miente" nunca se arregló para las ventas del TPV (`ventas_pos`)

**Ficheros:** `app/api/stripe/webhook/route.ts:785-829` (rama `ventaIdPos`
de `payment_intent.succeeded`), `app/api/pos/venta/confirmar/route.ts:93-121`
(sondeo síncrono), `supabase/migrations/20260907150310_pos_rpc_venta.sql:415-479`
(`confirmar_pago_venta_pos`).

El commit #1764 solo tocó la rama `reciboIdPos` del webhook (pago de una
cuota/recibo ya existente). La rama gemela `ventaIdPos` (una venta de
producto/bono desde el TPV) **no recibió el mismo arreglo**: ni el webhook
ni el sondeo síncrono derivan el método real del cargo. El método que queda
grabado es siempre `ventas_pos.metodo_pago`, fijado al **crear** la venta
(`app/api/pos/venta/route.ts`, antes de que la clienta pague nada) y nunca
corregido después.

`confirmar_pago_venta_pos` (la RPC que cierra la venta, tanto desde el
webhook como desde el sondeo) ni siquiera recibe un parámetro de método —
usa directamente `v.metodo_pago` (el de creación) para el apunte en
`movimientos_caja`:

```sql
INSERT INTO public.movimientos_caja (..., metodo_pago, ...)
VALUES (..., v_metodo, ...)   -- v_metodo = ventas_pos.metodo_pago, de creación
```

Y ese mismo campo (`ventas_pos.metodo_pago`) es la fuente de `porMetodo` en
el arqueo (`app/api/pos/catalogo/route.ts:64-70`). Es el mismo bug que P-3
describía para recibos ("el total del arqueo cuadraba, el desglose por
método mentía"), sin cerrar en absoluto para las ventas de producto —
probablemente el flujo más frecuente del TPV.

**Cómo se reproduce:** vender un producto por Bizum desde el TPV, pagar el
enlace con tarjeta. La venta se cierra igual (dinero correcto, sin doble
cobro — eso sí lo arregla P-1), pero tanto `ventas_pos.metodo_pago` como el
apunte en `movimientos_caja` y el desglose del arqueo dicen "BIZUM" cuando
el cargo real fue tarjeta.

**Arreglo propuesto:** aplicar el mismo patrón que P-3 introdujo para
recibos (leer `payment_method_details.type` del `latest_charge` del PI
cuando `origen === 'pos_bizum'`) también en la rama `ventaIdPos` del
webhook y en `venta/confirmar/route.ts`, y pasar el método derivado como
parámetro nuevo a `confirmar_pago_venta_pos` (o hacer un `UPDATE` aparte de
`ventas_pos.metodo_pago` justo antes/después de la RPC) para que el apunte
de caja y el arqueo usen el método real, no el de creación.

---

## 🟡 Hallazgo 3 — `checkout.session.expired` no verificable como evento suscrito

**Fichero:** `app/api/stripe/webhook/route.ts:1246-1265`.

P-2 añade un manejador nuevo para `checkout.session.expired` (venta/recibo
abandonados sin pagar). El código en sí es correcto e idempotente (mismo
`liberarCobroPosFallido` que el resto). Lo que **no es verificable desde el
repo** es si ese tipo de evento está dado de alta en la configuración del
endpoint del webhook en el Dashboard de Stripe (o si la cuenta usa un
listado explícito de eventos en vez de "todos"): este repo no gestiona la
suscripción de eventos como código (no hay ningún
`webhookEndpoints.create`/actualización en `lib/` ni `scripts/`), así que
si el endpoint tiene una lista curada de eventos y no incluye
`checkout.session.expired`, el handler nuevo es código muerto hasta que
alguien lo añada a mano en el Dashboard — sin ningún error visible, porque
Stripe simplemente no lo envía.

No se marca como bug confirmado porque no hay forma de comprobar la
configuración del Dashboard desde este entorno; se deja como aviso para
que se compruebe manualmente (Dashboard → Developers → Webhooks → el
endpoint de producción → Events to send) que `checkout.session.expired`
está en la lista, igual que ya debe estarlo `payment_intent.payment_failed`
para que la mitad SEPA de ese mismo bloque funcione.

---

## Revisado y descartado (no son hallazgos nuevos)

- **P-1 (doble cobro real por Bizum del mostrador) está bien cerrado.**
  `cancelar()` expira la Checkout Session de verdad
  (`lib/pos/terminal.ts:300-322`), y tanto `recibo/confirmar` como
  `venta/confirmar` vuelven a preguntar a Stripe (`consultar()`) DESPUÉS de
  cancelar, así que si el pago llegó a completarse un instante antes de
  pulsar "Cancelar" en el mostrador, gana lo que diga Stripe y no se anula
  una venta ya cobrada. `expires_at: 30 min` acota el enlace aunque nadie
  pulse cancelar.
- **P-2 (venta/recibo colgado reteniendo stock) está bien resuelto** para
  el caso que cubre: `fallar_pago_venta_pos` solo actúa sobre
  `PENDIENTE_PAGO` (idempotente), y el `UPDATE` de `recibos` va acotado a
  la referencia exacta cuando se conoce.
- El tenant en los dos handlers nuevos (`liberarCobroPosFallidoDelWebhook`)
  se resuelve por `event.account` (la cuenta Connect que firma), nunca por
  `metadata.studioId` a secas — respeta el criterio D-3 de la 22ª pasada.
- El fix de CI de la segunda parte del commit (omitir
  `cobro_mostrador_checkout_session_id` de `FilaReciboPanel`) es correcto y
  sigue el mismo patrón ya establecido para `cobro_mostrador_pi`.
- Revisadas también, sin hallazgos nuevos: la migración de RPC de créditos
  (`20260908170000_creditos_rpcs_comprueban_rol.sql`, S-1 de la 27ª pasada)
  — grants correctos (`REVOKE ... FROM PUBLIC` + `GRANT` explícito a
  `service_role`, sin el gotcha de firma nueva porque no cambiaron
  argumentos) y guardas de rol coherentes con sus RPC hermanas; y el resto
  de `git log --oneline -60`, que corresponde a funcionalidad ya auditada
  en pasadas anteriores o a áreas fuera de dinero/seguridad (Ayuda,
  gamificación de créditos por caducar, home/agenda, Orb de marca).

---

## Resumen

| Severidad | Nº | Descripción corta |
|---|---|---|
| 🔴 Crítico | 0 | — |
| 🟠 Importante | 2 | Método de cobro sigue mintiendo: en el camino síncrono de recibos (el que gana casi siempre) y en TODAS las ventas de producto del TPV. |
| 🟡 Menor | 1 | `checkout.session.expired` no verificable como evento suscrito en el Dashboard de Stripe. |

No se ha encontrado ningún hallazgo 🔴 nuevo en esta pasada. El foco fue el
commit de dinero más reciente (`265afd2c`, POS Bizum) por ser el más
probable de contener bugs sin descubrir; el resto del log reciente no
introduce banderas rojas nuevas de dinero/seguridad que no estén ya
cubiertas por las 27 pasadas anteriores o documentadas como decisión
cerrada en `tentare-os.md`.
