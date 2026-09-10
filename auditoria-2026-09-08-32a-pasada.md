# Auditoría 32ª pasada — 2026-09-08

**Área elegida: el checkout de planes de socia (Modo A `Stripe Checkout
Session` + Modo B `checkout embebido`), en concreto su cruce con la
matrícula online (#1731) y con la trazabilidad legal por compra
(#1756/#1761) — las tres piezas más recientes de esta familia
(commits `813da502`, `75724756`, `b32ef529`, todos de ayer y hoy).**

Motivo de la elección: es la superficie de dinero+legal más reciente del
repo que no tocó ninguna de las pasadas 27ª-31ª (esas fueron POS/TPV/Bizum,
SEPA/dunning/liquidaciones y gamificación). El propio mensaje de `b32ef529`
("casilla obligatoria al pagar") deja claro que este es un área donde
YA se ha encontrado un bug grave hace apenas unas horas (el portal firmaba
una raya horizontal) — exactamente el patrón que esta serie de auditorías
busca: código que se tocó por última vez ayer/hoy y mueve dinero real o
constancia legal real. Se contrastó contra `.claude/tentare-os.md` (sección
"El captcha invisible"/"Tentare ABIERTO al público" no aplica aquí; no hay
ninguna decisión cerrada sobre matrícula/legal-por-compra que esta pasada
reabra) y contra las cuatro auditorías `auditoria-2026-09-08-{28,29,30,31}a-pasada.md`
— ninguna menciona `matricula-online.ts`, `entregarPlanComprado`,
`idsDe`/`reciboMatriculaId` ni el checkout Modo A (`/api/stripe/checkout`).

**No se ha aplicado ningún fix — solo el informe, como se pidió.**

---

## 🔴 Hallazgo 1 — Un reembolso (total o parcial) de un cobro con matrícula solo toca el recibo del PLAN: el recibo de la matrícula se queda `COBRADO` para siempre, y la devolución registrada mezcla el importe de dos ventas distintas

**Ficheros:**
- `lib/billing/entregar-plan-comprado.ts:166-183` (`idsDe`, genera
  `reciboId` y `reciboMatriculaId` como dos filas de `recibos` distintas)
  y `:459-502` (inserta el recibo de matrícula APARTE, con su propio id).
- `lib/billing/entregar-plan-comprado.ts:144-146` (`ResultadoEntrega` solo
  devuelve UN `reciboId` — el del plan).
- `app/api/stripe/webhook/route.ts:585-590` (Modo A,
  `checkout.session.completed`) y `:955-978` (Modo B,
  `plan_web_embebido`): las dos ramas hacen
  `stripe.paymentIntents.update(pi.id, { metadata: { reciboId: entrega.reciboId, ... } })`
  — siempre `entrega.reciboId`, nunca `entrega.reciboMatriculaId`.
- `lib/billing/procesar-reembolso.ts:70-113` (`procesarChargeRefunded`):
  resuelve QUÉ recibo tocar leyendo `pi.metadata.reciboId` (un único valor)
  y decide `REEMBOLSO_TOTAL` comparando el ACUMULADO devuelto contra
  `charge.amount` — que en un cobro con matrícula es la suma plan+matrícula.
- `lib/billing/registrar-devolucion.ts:158-211` (`registrarDevolucion`):
  `importe_cobrado = rec.importe` (solo el recibo al que apunta, en este
  caso el del PLAN) pero `importe_devuelto = devueltoCentimos/100` (el
  ACUMULADO real de Stripe, que si es un reembolso total incluye también
  la matrícula).
- Origen del defecto: `app/api/stripe/checkout/route.ts:237-240` y
  `app/api/public/checkout-embebido/route.ts:267-269/429-431` (Modo A y
  Modo B, respectivamente) suman la matrícula al MISMO cargo que el plan —
  "un solo PaymentIntent, nunca un segundo cobro aparte" (comentario propio
  de la línea 429) — pero la mitad del sistema que sabe deshacer un cobro
  (reembolsos/disputas) nunca se enteró de que ahí dentro hay DOS recibos.

**El mecanismo:**

1. Una socia compra por primera vez un plan con matrícula (30 €) desde el
   widget público (Modo A o B, da igual). Stripe cobra un ÚNICO cargo de
   plan+matrícula (p. ej. 40 € plan + 30 € matrícula = 70 €).
   `entregarPlanComprado` crea DOS filas en `recibos`: `rec-web-…` (40 €,
   concepto "Alta web — X") y `rec-web-mat-…` (30 €, concepto "Matrícula —
   X"), cada una con su propia factura sellada (`sellarFacturaDeRecibo` se
   llama dos veces, líneas 445 y 488-500).
2. El webhook, tras entregar, sella en la metadata del PaymentIntent
   `reciboId: entrega.reciboId` — que es SIEMPRE el recibo del plan
   (`ResultadoEntrega` no tiene ningún campo para el segundo recibo). El
   recibo de la matrícula no queda referenciado en ningún sitio de Stripe.
3. Días después, la propietaria (o Stripe por disputa) devuelve el cargo
   ENTERO desde el Dashboard de Stripe — 70 €, el importe real del cliente.
   `charge.refunded` llega con `amount_refunded = 7000` céntimos,
   `amount = 7000` → `origenDeReembolso` decide `REEMBOLSO_TOTAL`.
4. `procesarChargeRefunded` marca `DEVUELTO` **solo** el recibo de 40 €
   (el único que conoce por `pi.metadata.reciboId`). El recibo de
   matrícula (30 €) se queda `estado: 'COBRADO'`, con su factura sellada
   intacta, para siempre — nada en el sistema vuelve a mirarlo.
5. Además, `registrarDevolucion` escribe una fila en `devoluciones` con
   `importe_cobrado: 40` (el `importe` del recibo al que apunta) e
   `importe_devuelto: 70` (el acumulado real de Stripe, que incluye la
   matrícula) — una devolución que dice haber devuelto MÁS de lo que su
   propio recibo dice haber cobrado. Cualquier lectura de esa tabla
   (exportación, cuadre con el banco, la propia UI de devoluciones) muestra
   un número que no cuadra con nada, y no hay ninguna pista de que el resto
   (30 €) pertenece a otra fila de `recibos` completamente distinta.

**Por qué es un bug de dinero real, no solo cosmético**: el recibo de
matrícula sigue contando como ingreso `COBRADO` en cualquier informe/cuadre
que sume `recibos.estado = 'COBRADO'` (facturación, ingresos del mes,
export a gestoría) **después de que Stripe ya devolvió ese dinero al
cliente** — el estudio declararía y pagaría impuestos sobre un ingreso que
ya no tiene. Y su factura (sellada con Veri*Factu) sigue siendo una factura
válida de una venta que ya no existe, sin ningún mecanismo — ni automático
ni manual, porque el panel no tiene forma de saber que hace falta — que
dispare la rectificativa correspondiente (`sellarFacturaDeRecibo` tiene un
camino de rectificativa, pero es disparo manual desde el recibo, y este
recibo nunca aparece como candidato porque su `estado` sigue diciendo
`COBRADO`).

Lo mismo ocurre, más silencioso todavía, con un reembolso PARCIAL pensado
para devolver solo la matrícula (p. ej. la propietaria se equivocó al
activarla y devuelve esos 30 €): `origenDeReembolso` lo clasifica
`REEMBOLSO_PARCIAL` (no flipa ningún `estado`), pero `registrarDevolucion`
igualmente anota esos 30 € como devueltos contra el recibo del PLAN (40 €)
— la matrícula, que es la que de verdad se devolvió, no se entera en
absoluto: su recibo sigue `COBRADO` con nada apuntando a que hubo un
reembolso relacionado.

**No es explotable por una socia** (el reembolso lo decide la propietaria o
Stripe/disputa, nunca la clienta) — es un defecto de contabilidad/fiscal
que aparece en cuanto exista al menos un reembolso sobre una compra con
matrícula. Dado que la matrícula online lleva viva solo dos días
(`813da502`, 7-sep), es probable que aún no haya ocurrido en producción,
pero el mecanismo está roto desde el primer commit que combinó los dos
cargos.

**Arreglo propuesto**: `ResultadoEntrega` debe devolver también
`reciboMatriculaId` (ya se calcula en `idsDe`, solo falta exponerlo), y las
dos ramas del webhook deben sellar AMBOS ids en la metadata del
PaymentIntent (p. ej. `reciboId` + `reciboMatriculaId`, o una lista). En
`procesarChargeRefunded`, cuando existan los dos, hay que repartir el
acumulado devuelto entre las dos filas de forma explícita — lo más simple y
correcto es reembolsar SIEMPRE el plan primero y la matrícula con el resto
(o proporcional al importe de cada recibo), y llamar a
`registrarDevolucion` una vez por cada recibo afectado con su propio
`importe_cobrado`/`importe_devuelto` coherente, en vez de una sola llamada
que mezcla los dos. Alternativa más simple a corto plazo: dejar de sumar la
matrícula al mismo cargo (cobrar dos PaymentIntents separados, uno por
recibo) — pero eso es lo que la propia P-1 decidió evitar a propósito
("un solo cargo de Stripe... nunca un segundo cobro aparte" no es cierto
del todo: SÍ hay dos recibos, así que el diseño ya asumía dos entidades
contables sobre un cargo — el reembolso es el único punto que no se
enteró).

---

## 🟠 Hallazgo 2 — El checkout Modo A (`/api/stripe/checkout`, redirección al Checkout Session hospedado de Stripe) sigue siendo un camino vivo de compra de plan y quedó completamente fuera del trabajo legal de ayer/hoy: sin casilla, sin texto del estudio, sin `terminos_hash`

**Ficheros:**
- `app/api/stripe/checkout/route.ts` — sin una sola mención a
  `terminosHash`/`terminosAceptadosEn`/`sellarCondicionesVigentes`/
  `consent_collection` en todo el fichero (comprobado por grep).
- `app/api/stripe/webhook/route.ts:545-546` (Modo A): lee
  `session.metadata?.terminosHash ?? null` — siempre `null`, porque quien
  crea la sesión nunca lo escribe.
- `app/reservar/[slug]/page.tsx:2115-2168` (`handleContratarPlan`) y
  `:3394` (botón "Contratar" sobre `planesContratables`, visible para
  cualquier visitante del widget público, autenticado o no, en cuanto
  `seccionVisible('bonos')` esté activa) — llama directo a
  `/api/stripe/checkout`, nunca a `/api/public/checkout-embebido`.
- `app/api/stripe/checkout/route.ts:36-41` (comentario propio): este mismo
  endpoint es también el **fallback de Bizum del checkout embebido**
  (Modo B) — no es una ruta legacy sin tráfico, es la vía documentada para
  cuando alguien paga por Bizum desde el widget "moderno".
- Comparar con `components/checkout-widget/checkout-embebido.tsx` (el
  único fichero que tocó `b32ef529`): ahí la casilla nace sin marcar,
  bloquea el botón de pagar, y enseña los dos documentos — todo eso vive
  SOLO en este componente.

**El mecanismo**: `#1756`/`#1761` (ayer y hoy) construyeron, con bastante
cuidado, la prueba legal por compra — hash del texto vigente sellado en
servidor, casilla obligatoria que bloquea el pago, textos EFECTIVOS del
estudio (con NIF/dirección, corrigiendo el bug de la "raya horizontal") —
pero los dos PRs solo tocaron `checkout-embebido.tsx` y las rutas que
sirven a Modo B (`checkout-embebido/route.ts`). El Modo A
(`/api/stripe/checkout`), que:

1. Es el botón "Contratar" que cualquier visitante del widget público ve en
   la sección de bonos (autenticada o no — `handleContratarPlan` manda
   `socioId: socia?.socioId ?? null`, sin bloquear el caso sin sesión), y
2. Es el fallback documentado de Bizum del propio checkout embebido,

... redirige a la página de Stripe Checkout hospedada, que no lleva
`consent_collection`/`custom_text` configurado (grep vacío) — así que **no
enseña ningún texto del estudio, ni pide ninguna casilla**. La clienta paga
viendo únicamente la pantalla genérica de Stripe. `recibos.terminos_hash`/
`terminos_aceptados_en` quedan `NULL` para el 100 % de las compras que
pasan por este camino — no por ser "una compra anterior a esto" ni una
"renovación automática/mostrador" (los dos casos que el propio comentario
de `CompraPlan.terminosHash` documenta como NULL esperado), sino por una
compra ONLINE nueva de un cliente real que el sistema cree haber protegido.

**Cómo se explota / cuándo ocurre**: no hace falta ningún truco — es el
comportamiento normal del botón "Contratar" en la vista de planes del
widget público, y del fallback de Bizum. Cualquier socia que compre un plan
por uno de estos dos caminos queda sin la prueba que #1756/#1761
construyeron expresamente para poder demostrar qué condiciones aceptó al
pagar — el mismo tipo de "un camino se corrigió y su gemelo no" que ya
documenta `.claude/tentare-os.md` para otros hallazgos de esta serie.

**Arreglo propuesto**: dos opciones, no excluyentes.
- Mínima: en `stripe/checkout/route.ts`, calcular el sello igual que hace
  `checkout-embebido/route.ts` (`sellarCondicionesVigentes`) y escribirlo
  en `metadata.terminosHash`/`terminosAceptadosEn` de la Checkout Session,
  y configurar `consent_collection: { terms_of_service: 'required' }` +
  `custom_text.terms_of_service_acceptance` con el texto/enlace del estudio
  para que Stripe SÍ pida una casilla (aunque sea genérica) antes de pagar.
- Más alineada con el resto del rediseño: si Modo A ya solo debería usarse
  como fallback de Bizum (no como camino principal de "Contratar" desde el
  widget), mover el botón "Contratar" de `reservar/[slug]/page.tsx` para
  que use `/api/public/checkout-embebido` igual que el resto del flujo de
  compra, y dejar `/api/stripe/checkout` solo como lo que su propio
  comentario dice que es: el fallback de Bizum (que sí necesitaría el
  mismo tratamiento de consentimiento que la opción mínima, porque también
  cobra dinero real).

---

## Otras piezas revisadas — sin hallazgos nuevos

- **`primeraVezConPlan`** (`lib/billing/matricula-online.ts`): la regla
  "cuenta suscripciones sin filtrar por estado" es correcta a propósito —
  una socia con una suscripción ya cancelada/devuelta sigue sin ser
  "primera vez" para efectos de matrícula, mismo criterio que mostrador.
  Fail-safe ante error de lectura (`return false` = no cobrar) verificado
  en las tres ramas (email con comodín, error de `socios`, error de
  `suscripciones`).
- **Idempotencia de `idsDe`/`entregarPlanComprado`** ante reintentos de
  Stripe: sólida — todo insert choca por PK (`23505`) y se ignora, incluida
  la matrícula (`reciboMatriculaId` deriva del mismo sufijo). Un reintento
  no duplica nunca ni el plan ni la matrícula.
- **Importe validado en servidor, nunca en el body** (`stripe/checkout` y
  `checkout-embebido`): confirmado en ambos — el precio sale siempre de
  `planes_tarifa`/`recibos`, el cliente no puede mandar un importe propio.
- **Guardia de tenant** (`plan.studio_id !== body.studioId`,
  `tenantAutorizado`/`studioDeCuentaConnect` en el webhook): correcto en
  las dos rutas y en las dos ramas del webhook — no se puede pagar un plan
  de un estudio con la cuenta Connect de otro.
- **`sellarCondicionesVigentes`/`configLegalDe`** (la corrección de la
  "raya horizontal" de `b32ef529`): revisado — compone bien NIF/dirección
  del estudio en servidor antes de sellar, y `studioPublico` ya no manda
  los campos crudos. Sin hallazgo nuevo sobre lo que ese PR ya cerró; el
  Hallazgo 2 de arriba es sobre lo que ese PR **no llegó a tocar**, no
  sobre un defecto en lo que sí tocó.
- **Recibo de matrícula y `entrega_aplicada`** (el snapshot de reversión):
  el recibo del plan sí lleva snapshot completo (`entrega_sesiones_antes/
  después`, etc.) para poder revertir la entrega desde el panel; el recibo
  de matrícula NO lleva ningún snapshot de entrega (no aplica: no entrega
  sesiones ni bono, es una venta sin contrapartida de servicio) — coherente
  con su propio comentario ("sin `suscripcion_id`: la matrícula no es de
  ningún ciclo"), no es un hallazgo.
- **Descuentos + matrícula** (`resolverDescuentoCheckout`): confirmado que
  el código de descuento se aplica solo sobre `plan.precio`, nunca sobre la
  matrícula (`importe = Math.max(0, ...)` se calcula ANTES de decidir
  `matriculaCentimos`, y la resta de descuento no toca esa variable) — el
  comentario de la línea 232-234 documenta esto explícitamente y el código
  lo cumple.

## Resultado

Dos hallazgos nuevos genuinos en el checkout de planes de socia, ambos
originados en cambios de las últimas 48 horas:

- 🔴 **Crítico**: un reembolso (total o parcial) de un cobro que incluyó
  matrícula solo actualiza el recibo del plan — el recibo de la matrícula
  se queda `COBRADO`, con su factura Veri*Factu sellada, para siempre,
  aunque Stripe ya haya devuelto ese dinero. La fila de `devoluciones`
  generada además mezcla el importe cobrado de un recibo con el importe
  devuelto del cargo combinado, produciendo un número que no cuadra con
  ninguna fuente. Es un defecto de contabilidad/fiscal silencioso, sin
  ningún error visible en el momento en que ocurre.
- 🟠 **Importante**: el checkout Modo A (`/api/stripe/checkout`) —vivo hoy
  como botón "Contratar" del widget público y como fallback de Bizum del
  checkout embebido— quedó fuera del trabajo de consentimiento legal de
  `#1756`/`#1761`: no muestra los textos del estudio, no exige ninguna
  casilla, y graba `terminos_hash`/`terminos_aceptados_en` como `NULL` en
  el 100 % de sus compras, exactamente lo que ese trabajo se construyó para
  evitar.

El resto de la pieza de matrícula online y de trazabilidad legal
(cálculo de "primera vez", idempotencia ante reintentos de Stripe,
validación de importe/tenant en servidor, composición de los textos
legales efectivos, interacción con códigos de descuento) está sólido y no
repite ningún patrón ya cerrado en pasadas anteriores.
