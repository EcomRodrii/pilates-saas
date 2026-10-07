# Stripe en modo test — probar cobros sin gastar un euro

Hoy **no existe ningún entorno de pruebas**: producción está en modo LIVE, los
dos únicos estudios con Stripe conectado son el del fundador y el de una clienta
real, y cada verificación de un cobro cuesta dinero de verdad. Este documento
monta el sandbox.

> **El código no necesita ningún cambio para funcionar en modo test.** Ya es
> agnóstico: lee `STRIPE_SECRET_KEY` y funciona igual con `sk_live_` o
> `sk_test_`. El literal `sk_test_XXXX` que aparece en los guardias es el
> centinela de «Stripe sin configurar», **no** «modo test» — una clave de test
> real (`sk_test_51…`) lo pasa sin problema.

---

## Antes que nada: la protección contra mezclar modos

`lib/billing/modo-stripe.ts` **bloquea** las dos combinaciones peligrosas, y lo
hace en los dos sitios por los que entra dinero (`cobrarReciboOffSession` y
`/api/stripe/checkout`):

| Dónde | Clave | Qué pasa |
|---|---|---|
| Producción | `sk_live_` | ✅ normal |
| Producción | `sk_test_` | 🚫 **bloqueado** |
| Local / preview | `sk_test_` | ✅ normal |
| Local / preview | `sk_live_` | 🚫 **bloqueado** |

Las dos son caras, por motivos distintos:

- **Clave live fuera de producción** es la peligrosa. Copiar el `.env.local` de
  producción a una máquina de desarrollo —cosa que pasa constantemente— deja
  cualquier `npm run dev` a un clic de cobrar de verdad a una socia real.
- **Clave test en producción** es la silenciosa. Nada falla: los cobros
  «funcionan», los recibos se marcan `COBRADO` y los ingresos del mes suben.
  Solo que no ha entrado un euro, y se descubre cuadrando con el banco semanas
  después.

Bloquea en vez de avisar porque un log de advertencia en un cron que corre a las
8:30 de la mañana no lo lee nadie.

Escotilla para el caso legítimo y raro (depurar producción desde una preview):
`STRIPE_PERMITIR_MODO_CRUZADO=1`. Va por variable de entorno a propósito —
obliga a ponerla a mano en Vercel, que es justo la fricción que se busca.

---

## Comprobación previa

Antes de tocar una tarjeta:

```bash
node scripts/stripe-sandbox-check.mjs
```

Dice qué falta y cómo arreglarlo, sin imprimir ningún valor secreto. Existe
porque el montaje tiene seis piezas que fallan **por separado y casi ninguna
avisa**: sin el webhook el cobro sale bien en Stripe y la app no se entera; con
la clave en el modo equivocado el guardia bloquea y el mensaje acaba en un log
que nadie mira. Descubrir eso con la tarjeta en la mano cuesta una tarde.

⚠️ Valida la CONFIGURACIÓN, no que el cobro funcione. Eso solo lo prueba pagar.

---

## Montaje

### 1. Claves de test (las pones tú)

En el [dashboard de Stripe](https://dashboard.stripe.com), con el interruptor
**Test mode** activado, en *Developers → API keys*:

```
STRIPE_SECRET_KEY=sk_test_…
```

⚠️ **En `.env.local`, nunca en el entorno de producción de Vercel.** Y si el
`.env.local` de esa máquina venía copiado de producción, sustituye la clave —
no la añadas debajo.

### 2. Una cuenta Connect de test

Los cobros a socias son *direct charges* sobre la cuenta conectada del estudio,
así que hace falta una cuenta conectada **de test**. En modo test, en
*Connect → Accounts → + New*, crea una cuenta Standard de prueba. Stripe permite
completar su onboarding con datos ficticios al instante.

Apunta su `acct_…`.

Para comprobarla desde la terminal, **`stripe accounts retrieve` no sirve**: no
acepta el id de una cuenta conectada. Pídela a la API directamente:

```bash
stripe get /v1/accounts/acct_TU_CUENTA_DE_TEST
```

### 3. Base de datos aparte

⚠️ **El estudio de pruebas NO puede vivir en la base de producción.** Si se mete
ahí con un `acct_` de test, los crons de producción (que corren con clave live)
intentarían hablar con esa cuenta y fallarían — y sus datos ensuciarían los
informes reales.

Lo correcto es Supabase local:

```bash
supabase start
```

Eso levanta la base con todas las migraciones y `supabase/seed.sql`, que ya trae
un estudio de demostración («Pilates Boutique») con socias, clases y planes. Los
correos del seed usan dominios `.test` (RFC 2606), así que ninguna prueba puede
escribir a un buzón real.

> Si `supabase start` no arranca, es el problema conocido de Docker: hay que
> apuntar `DOCKER_HOST` a colima y excluir el contenedor de analytics.

Luego pega el `acct_` de test en el estudio del seed:

```sql
update public.studios
set stripe_account_id = 'acct_TU_CUENTA_DE_TEST'
where id = 'studio-1';
```

### 4. Webhooks

El webhook es lo que guarda la tarjeta y marca el recibo `COBRADO`. Sin él, el
cobro sale bien en Stripe y **la app no se entera**.

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

El comando imprime un `whsec_…`: ponlo en `.env.local`.

```
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…
```

⚠️ Los cobros a socias ocurren en la **cuenta conectada**, así que hay que
escuchar también sus eventos:

```bash
stripe listen --forward-connect-to localhost:3000/api/stripe/webhook
```

### 5. Probar

`npm run dev`, entra al portal del estudio del seed, y paga con:

| Tarjeta | Qué prueba |
|---|---|
| `4242 4242 4242 4242` | pago correcto |
| `4000 0000 0000 9995` | fondos insuficientes → dunning |
| `4000 0000 0000 0341` | se guarda pero falla al cobrar off-session |
| `4000 0025 0000 3155` | pide 3D Secure |

Cualquier fecha futura y cualquier CVC.

**Qué comprobar después de un pago correcto:**

```sql
select nombre, tarjeta_marca, tarjeta_ultimos4, tarjeta_exp_mes, tarjeta_exp_anio
from public.socios where stripe_payment_method_id is not null;
```

Si `tarjeta_exp_mes`/`anio` salen rellenos, la captura de caducidad (Fase 3 del
Brain) funciona de punta a punta.

---

### 6. Los crons de dinero (sin esperar a las 8:30)

Aquí está la parte que de verdad no se ha probado nunca: el checkout es la
puerta fácil, pero el dunning, las renovaciones y las penalizaciones **solo
corren por cron**, y en local nadie los dispara. Se hace con el servidor de
desarrollo de Inngest, y hacen falta **dos** cosas, no una.

**a) `next dev` en modo dev de Inngest.** Un `npm run dev` a secas NO basta:

```bash
INNGEST_DEV=1 npm run dev
```

⚠️ Sin esa variable el SDK de Inngest arranca en **modo cloud**, pide una clave
de firma que en local no hay, y `GET`/`PUT /api/inngest` responden
`500 {"code":"internal_server_error"}` (el error de verdad, «No signing key»,
solo sale en el log del servidor). El servidor de Inngest dev no registra
entonces **ninguna** función y el panel sale vacío, sin decir por qué. Con la
variable puesta, `curl http://localhost:3000/api/inngest` devuelve
`"mode":"dev"` y la lista de funciones (26 el 15-sep-2026).

- ⚠️ **Nunca en el entorno de producción de Vercel.** Modo dev significa sin
  clave de firma: `/api/inngest` dejaría de comprobar que quien llama es
  Inngest, y detrás están los crons que cobran.
- Si el `.env.local` de ese worktree es un **enlace** al de otro, pásala en la
  línea de comandos como arriba en vez de escribirla en el fichero: editarlo
  cambia también el entorno del otro worktree.

**b) El servidor de Inngest, apuntando a la app:**

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Abre un panel en `http://localhost:8288` donde se pueden **lanzar eventos** e
**invocar funciones** a mano. Si en *Functions* no aparece nada (p. ej. porque
`next dev` arrancó después, o se reinició sin la variable), fuerza el registro:

```bash
curl -X PUT http://localhost:3000/api/inngest
```

**Las que van por evento, con su payload** — el `nowISO` no es decorativo:
manda la ventana de tiempo, así que moviéndolo se prueba «mañana» sin esperar:

| Evento | Payload | Qué ejerce |
|---|---|---|
| `dunning/studio.sweep` | `{"studioId":"studio-1","nowISO":"<fecha futura>"}` | reintento de recibos impagados |
| `renovaciones/studio.sweep` | `{"studioId":"studio-1","nowISO":"<fecha>"}` | recibo de renovación de cuotas caducadas |

Se pueden lanzar desde el panel o directamente contra el servidor dev (en local
la clave de evento no se comprueba, vale cualquier texto):

```bash
curl -X POST http://localhost:8288/e/clave-local \
  -H 'Content-Type: application/json' \
  -d '{"name":"dunning/studio.sweep","data":{"studioId":"studio-1","nowISO":"2026-12-01T08:30:00Z"}}'
```

El `nowISO` del dunning tiene que ser **posterior** al `proximo_reintento` del
recibo, o el barrido no lo ve vencido y no hace nada. Para **agotar los
reintentos sin esperar**, repite el evento con `nowISO` en el día **+1**, el
**+3** y el **+7** del vencimiento del recibo, a las 08:30Z (`OFFSETS_REINTENTO_DIAS`
en `lib/billing/dunning.ts`): cada fallo programa el siguiente intento a las
00:00Z del día `vencimiento + 3` y `vencimiento + 7`, y el tercer barrido deja el
recibo en `FALLIDO`. Si usas un `nowISO` posterior a esas fechas, el reintento
nunca va antes de 2 días tras el primer fallo ni de 4 tras el segundo, contados
desde ese «ahora»: mueve `nowISO` **+2 días** y luego **+6 días** respecto al primero.

**Las que solo tienen cron** se invocan desde el panel por su id, sin payload:
*Functions* → filtra por el id → **Invoke** → **Invoke Function** en el diálogo.

| Función | Id |
|---|---|
| Penalizaciones | `penalizaciones-procesar` |
| Conciliador de cobros | `conciliar-cobros` |

⚠️ **El conciliador es el camino principal, no una red de seguridad.** Los
cobros de plan que llegan sin webhook los rescata él, así que probar el checkout
sin probar el conciliador deja fuera la vía por la que de hecho entran los
pagos.

⚠️ **Estos crons cobran de verdad contra la clave que tengas puesta.** Con
`sk_test_` es dinero de juguete; comprobar con
`node scripts/stripe-sandbox-check.mjs` **antes** de invocarlos, no después.

---

## Sin claves: las llamadas del servidor contra `stripe-mock`

Todo lo de arriba necesita una cuenta de Stripe en modo test. Esto no: comprueba
que **cada petición que el servidor le hace a Stripe en los flujos de la alumna**
es una petición que Stripe aceptaría (parámetros que existen, tipos, valores de
los enums), sin clave, sin cuenta y sin red. Lo hace
[`stripe-mock`](https://github.com/stripe/stripe-mock), el simulador oficial de
Stripe, que valida cada petición contra su especificación OpenAPI.

```bash
brew install stripe/stripe-mock/stripe-mock      # una vez
stripe-mock -http-port 12191 -https-port 12192    # en otra terminal
node --import ./scripts/register-test-hooks.mjs --test --experimental-strip-types \
  lib/billing/stripe-mock.integracion.test.ts
```

**Para la CI** está preparado, pero el job aún no existe (tocar `.github/workflows`
exige un permiso que esta sesión no tenía): en el job «Tests unitarios», la imagen
`stripe/stripe-mock:v0.206.0` como `services` en el puerto 12111 y, en el paso de
`npm test`, `STRIPE_MOCK_PORT=12111` y `STRIPE_MOCK_OBLIGATORIO=1`. Con esa
variable, si stripe-mock no contesta en 30 s la prueba FALLA en vez de saltarse
(en la CI un salto sería un verde sin comprobar nada).

Con `STRIPE_MOCK_DETALLE=1` cada prueba lista lo que le pidió a Stripe y qué
contestó. Otro puerto: `STRIPE_MOCK_PORT=…`. **En local, sin stripe-mock en marcha, las
pruebas se saltan solas** (así `npm test` no depende de él).

Llama a las rutas y funciones **reales** (`/api/stripe/checkout`,
`/api/public/checkout-embebido`, `/api/public/tarjeta`, `/api/reembolsos`,
`/api/stripe/webhook`, `cobrarReciboOffSession`), no a copias. El arnés
(`lib/billing/stripe-mock-arnes.ts`) solo sustituye lo que no puede correr fuera
de Next: la base de datos (una en memoria), quién es la alumna, el límite de
peticiones y `after()`. Los webhooks se firman con
`stripe.webhooks.generateTestHeaderString`, con objetos con la forma que
devuelve stripe-mock.

- **Nada sale de la máquina**: todo `new Stripe(...)` del proceso se apunta a
  stripe-mock y su cliente HTTP reescribe cualquier URL a él; además el `fetch`
  global corta (y apunta, y la prueba falla) cualquier petición fuera de
  localhost — p. ej. el `fetch` directo a `api.stripe.com/v1/account` del webhook,
  Resend o Supabase. El arnés se niega a arrancar en producción o con una clave
  `sk_live_` en el entorno.
- **stripe-mock no guarda estado**: contesta siempre con su fixture. Para seguir
  un flujo (un cobro `succeeded`, una sesión `complete`) la prueba RETOCA la
  respuesta, siempre después de que stripe-mock haya validado la petición.
- ⚠️ **Versión de la API.** stripe-mock 0.206.0 valida contra
  `2026-09-30.endive`; el SDK fija `2026-06-24.dahlia`. En endive Stripe **quitó
  `payment_method_types`** al crear PaymentIntents, SetupIntents y sesiones de
  Checkout ([cambio](https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions),
  [y este](https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents)).
  En nuestra versión es válido, así que el arnés lo manda a validar como
  `allowed_payment_method_types` (mismo tipo). **El día que se suba el
  `apiVersion` a endive, eso deja de ser un falso positivo**: hay que migrar las
  llamadas que lo usan (Checkout de recibos y de Bizum, guardar tarjeta, adeudo
  SEPA off-session…) antes de subir.
- ⚠️ **El otro lado del desfase:** un parámetro que exista en endive y no en
  dahlia pasaría stripe-mock y Stripe lo rechazaría con nuestra versión. Hoy lo
  tapa `tsc` (los tipos del SDK son los de dahlia), salvo en objetos con cast. Si
  hace falta validar la versión exacta, stripe-mock acepta `-spec` y `-fixtures`
  con la OpenAPI de dahlia del repo `stripe/openapi`.

**Lo que stripe-mock NO comprueba:** reglas que no están en el esquema (el
`expires_at` entre 30 min y 24 h, combinaciones de parámetros incompatibles,
que el Customer sea de esa cuenta), 3D Secure de verdad, Apple Pay / Google Pay,
el Checkout incrustado dentro del WKWebView de la app de iOS, ni los tiempos y
reintentos reales de los webhooks. Eso sigue necesitando el modo test de arriba
o mirarlo a mano.

---

## Lo que este montaje NO cubre

- **SEPA.** El adeudo domiciliado es asíncrono (tarda días y puede devolverse
  hasta 8 semanas). En test Stripe lo resuelve al instante, así que el sandbox
  sirve para el camino feliz pero **no** para probar los tiempos reales ni el
  backstop de reconciliación de `lib/inngest/dunning.ts`.
- **Veri*Factu / Fiskaly**, que tiene su propio entorno de pruebas aparte.
