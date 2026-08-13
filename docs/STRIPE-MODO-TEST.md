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
desarrollo de Inngest:

```bash
npx inngest-cli@latest dev
```

Descubre solo `http://localhost:3000/api/inngest` (con `npm run dev` levantado)
y abre un panel en `http://localhost:8288` donde se pueden **lanzar eventos** e
**invocar funciones** a mano.

**Las que van por evento, con su payload** — el `nowISO` no es decorativo:
manda la ventana de tiempo, así que moviéndolo se prueba «mañana» sin esperar:

| Evento | Payload | Qué ejerce |
|---|---|---|
| `dunning/studio.sweep` | `{"studioId":"studio-1","nowISO":"2026-08-13T08:30:00Z"}` | reintento de recibos impagados |
| `renovaciones/studio.sweep` | `{"studioId":"studio-1","nowISO":"2026-08-13T08:00:00Z"}` | recibo de renovación de cuotas caducadas |

**Las que solo tienen cron** se invocan desde el panel por su id, sin payload:

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

## Lo que este montaje NO cubre

- **SEPA.** El adeudo domiciliado es asíncrono (tarda días y puede devolverse
  hasta 8 semanas). En test Stripe lo resuelve al instante, así que el sandbox
  sirve para el camino feliz pero **no** para probar los tiempos reales ni el
  backstop de reconciliación de `lib/inngest/dunning.ts`.
- **Veri*Factu / Fiskaly**, que tiene su propio entorno de pruebas aparte.
