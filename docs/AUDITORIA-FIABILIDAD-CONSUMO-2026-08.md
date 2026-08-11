# Auditoría de fiabilidad, consumo e infraestructura — 2026-08-11

Auditoría previa al estándar "0 fallos visibles para la propietaria". Todo lo de
aquí está **medido contra producción** (`dwqvdycjcffqwfkzapvi`, Sentry
`tentare-software`, código en `main` a e0943657), no inferido. Donde no he podido
medir, lo digo.

## Punto de partida medido

| Magnitud | Valor real (2026-08-11) |
|---|---|
| Estudios | 10 |
| Socias | 214 |
| Reservas | 159 |
| Sesiones | 88 |
| Recibos | 40 |
| Suscripciones activas | 16 |
| Tamaño BD | 45 MB / 8 GB |
| Issues abiertas en Sentry (30d) | 9 (máx. 8 eventos) |

**Consecuencia que condiciona toda la auditoría:** con este volumen, el consumo
actual **no depende de los datos**, depende de la frecuencia fija de los crons.
Y los fallos actuales no son de carga: son de *corrección*. Buscar "queries
lentas" aquí sería perder el tiempo; el riesgo está en truncados silenciosos y
en un camino de pago roto.

---

# 🔴 CRÍTICO

## C-1 · El webhook de pagos está fallando AHORA, y el conciliador que lo tapa tiene un tope silencioso

**Problema.** Hay cobros reales en modo *live* que Stripe cobra y el webhook no
entrega. Los está rescatando el conciliador. Es decir: **la red de seguridad es
hoy el camino principal**, y nadie lo ha declarado así.

**Dónde está.**
- Evidencia: Sentry [`JAVASCRIPT-NEXTJS-13`](https://tentare-software.sentry.io/issues/JAVASCRIPT-NEXTJS-13)
  — `[conciliador] cobro sin entregar recuperado`, **5 eventos**, del 2026-08-09
  al **2026-08-10 18:00**, `environment: vercel-production`,
  `sesionId: cs_live_a1VCh2…`, `studioId: studio-1`, `tipo: plan`.
- Correlacionado con [`JAVASCRIPT-NEXTJS-10`](https://tentare-software.sentry.io/issues/JAVASCRIPT-NEXTJS-10)
  `[billing webhook] checkout de PAGO en el webhook del SaaS` (4 eventos, misma
  ventana) y [`JAVASCRIPT-NEXTJS-15`](https://tentare-software.sentry.io/issues/JAVASCRIPT-NEXTJS-15)
  `[stripe webhook] la cuenta Connect no corresponde al estudio de la metadata`
  (3 eventos).
- El tope: [`lib/inngest/conciliar-cobros.ts:47`](../lib/inngest/conciliar-cobros.ts#L47)

```ts
const lista = await stripe.checkout.sessions.list(
  { created: { gte: desde }, limit: 100 },   // ← sin paginar
  { stripeAccount: studio.stripe_account_id },
);
```

**Por qué ocurre.** Dos causas encadenadas:
1. El reparto de destinos de eventos en Stripe sigue mal: un `checkout.session.completed`
   de una compra de socia llega al destino del SaaS. El código ya lo detecta y lo
   reporta (bien), pero **no lo entrega** — a propósito, para no duplicar lógica.
   Quien lo entrega es el conciliador, 5 minutos después.
2. El conciliador pide 100 sesiones y lee `lista.data` directamente. Stripe
   devuelve **las más recientes primero**. Si un estudio supera 100 checkouts en
   la ventana de 12 h, las que se caen son **las más antiguas** — exactamente las
   que llevan más tiempo sin entregar. Y como la ventana es deslizante, una vez
   que una sesión atascada sale del top-100 **no vuelve nunca**.

Que es un descuido y no una decisión lo confirma el contraste: en
[`app/api/interno/facturacion/route.ts:55`](../app/api/interno/facturacion/route.ts#L55)
sí se usa `for await (const sub of stripe.subscriptions.list(…))`, que autopagina.
**`grep` de `has_more` / `autoPagingEach` / `autoPagingToArray` en todo el repo: 0
resultados.**

**Impacto actual.** Contenido pero real: hay dinero cobrado que solo llega por la
red de seguridad. Con el volumen de hoy (40 recibos en total), 100 sesiones/12 h
sobra, así que el tope no está mordiendo *todavía*. El fallo visible hoy es el
retraso de hasta 5 min en la entrega, y la dependencia de un único mecanismo.

**Impacto con 100 estudios.** Un estudio de tamaño medio con venta online activa
pasa de 100 checkouts/12 h en campaña (inicio de temporada, promoción). En ese
momento el conciliador deja de ver sus cobros antiguos y **el dinero se pierde en
silencio**: no hay error, no hay Sentry, el `return pendientes.length` cuenta 0.

**Impacto con 1.000 estudios.** Además del truncado, son 1.000 llamadas a Stripe
cada 5 min = **288.000 llamadas/día**, muy por encima del rate limit de Stripe
(100 req/s en live). El conciliador empezaría a recibir 429 y a fallar por
completo.

**Solución recomendada.**
1. **Arreglar el destino en Stripe** (raíz): suscribir `checkout.session.completed`
   de las cuentas Connect a `/api/stripe/webhook` y quitarlo del destino del SaaS.
   Esto devuelve el conciliador a su papel de red de seguridad.
2. **Paginar el conciliador**: `for await (const s of stripe.checkout.sessions.list({…}))`,
   igual que ya se hace en `facturacion/route.ts`. Es un cambio de 3 líneas.
3. **Que el truncado no pueda volver a ser silencioso**: si `has_more` sigue true
   al agotar un tope defensivo, `Sentry.captureMessage` con nivel `error`.
4. A escala, el bucle por estudio pasa a fan-out con `concurrency` acotada, no a
   un `for` secuencial dentro de un solo `step.run`.

**Prioridad.** Máxima. (1) y (2) son de hoy.

**Riesgo si no se corrige.** Pérdida de dinero de socias, silenciosa y sin
alerta, en el primer estudio que tenga un pico de ventas. Es exactamente el fallo
del 8-ago-2026 (1 €, descubierto porque la socia se quejó) pero sin la red que lo
salvó aquella vez.

---

## C-2 · El arreglo de cuota de Inngest reintrodujo el truncado a 1.000 filas que ya costó los backups

**Problema.** Siete crons de alta frecuencia hacen una **query global sin
paginar**. PostgREST corta en 1.000 filas **en silencio**. Este repo ya sangró por
esto (PR #684, `95da6a5b fix(datos): paginar tres lecturas que PostgREST truncaba
a 1000 filas en silencio`).

**Dónde está.** Sin `.limit()` ni `.range()` ni `fetchAllRows`:

| Cron | Frecuencia | Query global |
|---|---|---|
| `notif-automations.ts` (`recordatoriosGlobal`) | */15 | reservas en ventana de 25 h, **todos los estudios** |
| `lista-espera-ofertas.ts` | */5 | ofertas vivas |
| `reservas-pendientes.ts` | */5 | reservas `PENDIENTE_APROBACION` |
| `minimo-asistentes.ts` | */15 | sesiones en ventana de 2 h |
| `checkin-automatico.ts` | */15 | sesiones + reservas |

> **Corrección sobre la primera versión de este informe.** Aquí figuraban también
> `recordatorios.ts` y `confirmacion-riesgo.ts`, y **no corresponde**: al
> implementar el arreglo se comprobó que ambos hacen fan-out por estudio y sus
> lecturas van acotadas (`.eq('studio_id', studioId)`, p. ej.
> `confirmacion-riesgo.ts:105`). Su techo es el de un solo estudio, no el de la
> plataforma, así que quedan fuera de C-2. Son **5**, no 7.

Único que se salva: `penalizaciones.ts:181` (`.limit(200)` — acotado, aunque
también trunca sin avisar).

**Por qué ocurre.** El cambio que colapsó el fan-out por estudio a una query
global fue **correcto** y necesario (bajó del 84 % de la cuota free de Inngest).
Pero al pasar de "N queries de un estudio" a "1 query de todos", cada query pasó a
poder cruzar las 1.000 filas, y no se añadió paginación. El helper correcto ya
existe en el repo —`fetchAllRows`, [`lib/db/supabase-data-admin.ts:375`](../lib/db/supabase-data-admin.ts#L375),
con el comentario que explica justo este fallo— pero los crons no lo usan.

**Impacto actual.** Ninguno. Medido: el estudio más cargado (`studio-1`) tiene
**20,3 plazas/día**; la ventana de 25 h de `recordatoriosGlobal` mueve decenas de
filas, no miles.

**Impacto con 100 estudios.** Aquí está lo importante, y es más cercano de lo que
parece. El umbral no es "1.000 estudios", es **el número de estudios activos que
llenen 1.000 reservas en 25 h**:

- a la densidad medida hoy (≈20 plazas/día/estudio) → se cruza sobre los **50 estudios**;
- a densidad de un estudio de Pilates lleno de verdad (8–12 clases/día × 8–12
  plazas ≈ 100/día) → se cruza sobre los **10 estudios**.

Es decir: **entre los próximos 10 y 50 clientes reales**, no en un futuro
lejano. Al cruzarlo, las socias de la parte truncada **dejan de recibir el
recordatorio de su clase** y no hay ni error ni registro. Se manifiesta como
"Tentare no avisó a mis clientas" — el fallo más visible posible para la
propietaria.

**Impacto con 1.000 estudios.** El truncado es total: se atiende a un ~1 % de los
estudios y el resto queda sin recordatorios, sin check-in automático y sin corte
por mínimo de asistentes, en silencio.

**Solución recomendada.**
1. Envolver las 7 lecturas en `fetchAllRows` (o `.range()` en bucle). El patrón ya
   está escrito y probado en el repo.
2. Añadir la guardia genérica: si una lectura devuelve exactamente el tamaño de
   página, o `count` > filas leídas, `Sentry.captureMessage` en vez de continuar
   como si nada. Un truncado nunca debe ser indistinguible de "no había más".
3. Test de regresión con >1.000 filas sembradas para al menos `recordatoriosGlobal`.

**Prioridad.** Alta — antes del siguiente tramo de altas de estudios.

**Riesgo si no se corrige.** Notificaciones críticas perdidas sin registro,
que es literalmente uno de los invariantes del estándar. Y se degrada
*gradualmente*: no hay un momento en que "se rompa", solo un porcentaje creciente
de socias que dejan de recibir avisos.

---

## C-3 · Las 16 lecturas de `studios` que alimentan el fan-out también truncan (descubierto al arreglar C-2)

**Problema.** Todos los dispatchers que hacen fan-out leen la lista de estudios
con un `select` global sin paginar. Al pasar de 1.000 estudios, **los que caigan
fuera del corte dejan de existir para el sistema**: sin backups, sin
recordatorios, sin renovaciones, sin dunning, sin análisis del Decision OS. En
silencio.

**Dónde está.** **14 sitios** (no 16 — al implementarlo se comprobó que
`penalizaciones.ts:27` lee UN estudio, no una lista, y
`cierre-gestoria-automatico.ts:63` es un `update`, no un `select`; ninguno de los
dos trunca):

- **7 con la forma idéntica** `select('id')` + filtro de suspendidos:
  `backups.ts`, `recordatorios.ts`, `renovaciones.ts`, `revisiones-salud.ts`,
  `valoraciones.ts`, `resumen-semanal.ts`, `notif-automations.ts`.
- **7 con columnas o filtros propios**: `decision.ts`, `automatizaciones.ts`,
  `confirmacion-riesgo.ts` (×2), `dunning.ts`, `conciliar-cobros.ts`,
  `cierre-gestoria-automatico.ts`.

**Por qué ocurre.** Es la misma causa que C-2 (PostgREST corta a 1.000 en
silencio), pero sobre una tabla que crece con **clientes**, no con uso. Por eso
el umbral es distinto y mucho más lejano: exactamente 1.000 estudios.

**Impacto actual / 100 / 1.000.** Nulo · nulo · **total a partir del estudio
1.001**. Es el único hallazgo de este informe con un umbral exacto y conocido.

**Solución aplicada.** No un helper único para los 14, como decía la primera
versión de este informe: al mirarlos de cerca, la mitad usa columnas o filtros
propios (`stripe_account_id`, `pedir_confirmacion_riesgo`, `plan`,
`gestoria_email`…), y forzarlos todos por un mismo helper lo habría hecho crecer
en opciones hasta dejar de ser uno. Se hizo lo que encaja con la variación real:

- `idsEstudios()` (`lib/inngest/estudios.ts`) para los **7 idénticos**, con un
  único parámetro `incluirSuspendidos` porque `backups` deliberadamente no filtra
  suspendidos (los backups son continuidad de datos, no comunicación).
- `fetchAllRows` directo en los **7 con forma propia**.

**Prioridad.** Baja en tiempo (hay 100× de margen), alta en facilidad.

**Riesgo si no se corrige.** Con 10 estudios hoy, ninguno a corto plazo. El
peligro real es que se olvide: el fallo aparecería de golpe, afectando solo a los
clientes más nuevos, y sin ningún error que lo señale.

---

# 🟠 IMPORTANTE

## I-0 · N+1 en `minimo-asistentes`, agravado por el propio arreglo de C-2

**Dónde.** `lib/inngest/minimo-asistentes.ts:75` — un `count` por sesión dentro
del bucle:

```ts
for (const s of sesiones) {
  const { count } = await admin.from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('sesion_id', s.id).eq('estado', 'CONFIRMADA');
```

**Por qué importa ahora.** Antes de paginar, `sesiones` estaba topado de hecho a
1.000 por el truncado; el N+1 tenía un techo accidental. **Al arreglar C-2 ese
techo desaparece**, así que la corrección es mayor pero el coste del bucle ya no
está acotado: a 1.000 estudios son ~1.000 consultas cada 15 min, dentro de un
solo `step.run`.

Lo digo explícitamente porque es una consecuencia directa del arreglo que acabo
de hacer, no un hallazgo independiente.

**Solución.** Una sola agregación (`select sesion_id, count(*) … group by`) vía
RPC, o traer las reservas de todas las sesiones en una lectura paginada y contar
en JS — que es lo que ya hace `checkin-automatico`.

**Prioridad.** Media. No corrompe nada; solo consume.

## I-1 · Los 3 barridos de Vercel con techo de 300 s — RESUELTO

**Dónde.** `vercel.json` → `/api/cron/no-shows` (diario), `/api/cron/dependency-risk`
(semanal), `/api/cron/materializar-plazas` (diario). Los tres con
`maxDuration = 300` y el comentario explícito "todos los estudios en una sola
invocación".

**Por qué.** Misma clase que C-2 pero **truncando por tiempo en vez de por
filas**. Son idempotentes (bien), pero al agotar los 300 s Vercel los mata a
media pasada y **no queda constancia de por dónde iban**: la siguiente ejecución
empieza otra vez por el principio, así que si el barrido no cabe en 300 s los
estudios del final de la lista **no se procesan jamás**. No se vería como una
caída, se vería como "a unos estudios les funciona y a otros no".

> **Corrección sobre el diagnóstico inicial.** Este informe proponía "procesar por
> lotes con cursor persistido". Al abrirlos, el problema dominante **no era la
> falta de cursor sino los `await` secuenciales por elemento**, y los tres tenían
> formas distintas. Un cursor no habría arreglado el precipicio de
> `dependency-risk`, que es el peor de los tres. Tampoco hizo falta ninguna
> migración.

**Lo que resultó ser cada uno:**

| cron | problema real | arreglo |
|---|---|---|
| `dependency-risk` | **el precipicio de verdad**: `for` secuencial sobre TODOS los estudios con varias consultas cada uno, y **un segundo** `for` secuencial publicando avisos + retención por estudio | `mapLimit(…, 8)` en ambos; lista de estudios paginada |
| `no-shows` | no era cliffs sino **trabajo redundante**: escaneaba las sesiones de 30 días *cada noche*, re-barriendo lo ya barrido | pedir las **reservas** que siguen `CONFIRMADA`, no el universo de sesiones |
| `materializar-plazas` | la RPC hace el grueso en SQL (bien), pero luego **un `await` por hueco** para avisar a cada socia | `mapLimit(…, 8)` |

**Medido en producción antes de tocar `no-shows`**: escaneaba **35 sesiones para
1 con trabajo real**. En régimen estacionario la redundancia es del orden de la
ventana (cada noche vuelve a incluir los 29 días anteriores). Se verificó en vivo
que ambas formulaciones devuelven **el mismo conjunto** (1 = 1) antes de cambiar
nada, y la nueva consulta se validó contra el PostgREST real (HTTP 200).

Al reformular se conservan explícitamente los dos filtros que importaban —la
clase tiene que haber **terminado** y **no estar cancelada** (a nadie se le marca
falta en una clase que se canceló)— y la guardia de carrera del `UPDATE`
(`estado = CONFIRMADA`), para no pisar una cancelación hecha desde el panel entre
la lectura y la escritura. Los cuatro van blindados con test.

**De paso**, dos cosas que estaban al lado:
- `calcularDependenciaTodosLosEstudios` leía `studios` **sin paginar** — una
  instancia de C-3 que no salió en el barrido inicial porque vive en
  `lib/instructor-dependency.ts`, fuera de `lib/inngest/` y `app/api/cron/`.
- Un estudio cuyo cálculo fallaba se perdía en un `console.error`. Ahora va a
  Sentry con su `studioId`.

## I-2 · No existía ningún health check — RESUELTO

**Dónde.** No había `app/api/health/` ni equivalente. Verificado.

**Por qué importa.** El estándar pide detectar antes que la propietaria. La
detección de que algo se había quedado a medias era *reactiva*: llegaba por
Sentry cuando ya había fallado, o por una llamada de la clienta.

**Solución aplicada.** Dos endpoints, separados por lo que cuestan y por lo que
revelan:

- **`GET /api/health`** — liveness. Público, una sola consulta `head` a la BD con
  timeout de 3 s. Es lo que un monitor externo puede sondear cada minuto. **No
  llama a Stripe, Resend ni Inngest a propósito**: sondear terceros cada minuto
  desde un endpoint público es regalar cuota de API y una vía de abuso. Y no
  filtra nada del negocio, porque no puede pedir credenciales a un monitor.
- **`GET /api/health/flujos`** — los invariantes. Cerrado, con **dos puertas**:
  sesión interna con permiso `logs.read`, o `Bearer CRON_SECRET`. La segunda no
  es un extra: sin ella esto sería un panel que alguien tiene que acordarse de
  mirar, y un panel que hay que recordar mirar no detecta nada de noche.

Devuelve 200 aunque haya fallos: el código HTTP dice si la *comprobación* se pudo
hacer, no si el sistema está sano. Mezclarlo haría indistinguible "hay 3 cobros
atascados" de "el endpoint está roto".

**Los cinco invariantes** (todos contrastados contra producción antes de
escribirlos, para no meter ninguno que naciera en rojo por ruido). Cuatro son
además **detectores de cron muerto**: si un cron deja de correr, su invariante
crece solo — el hueco que Sentry no ve, porque no hay excepción, simplemente no
pasa nada.

| id | qué detecta | valor real hoy |
|---|---|---|
| `reservas-pendientes-sin-expirar` | cron de reservas pendientes parado | 0 |
| `ofertas-lista-espera-sin-expirar` | cron de ofertas parado | 0 |
| `webhooks-sin-completar` | pago que el webhook empezó y no terminó | **2** ⚠️ |
| `penalizaciones-atascadas` | cron de penalizaciones parado | 0 |
| `recibos-cobrados-sin-fecha` | incoherencia en el histórico de dinero | 0 |

Descartada `reservas-huerfanas`: `reservas_sesion_id_fkey` es `ON DELETE
CASCADE`, así que es imposible por construcción. Una comprobación que no puede
saltar nunca es ruido.

**Una comprobación que falla NO cuenta como `ok`**, cuenta como `fallo`. Es el
bug clásico de los health checks —el panel verde mientras el sistema arde— y va
cubierto con un test.

## I-2b · Lo que encontró el propio health check: el webhook de Connect se atasca solo

Construir la comprobación `webhooks-sin-completar` destapó algo que no estaba en
la primera versión de este informe y que **afina la causa raíz de C-1**.

Hay **2 filas en `webhook_events` con estado `procesando` desde el 9-ago 22:10**.
Las dos son del ámbito `connect:` (el que entrega el bono). Sus gemelas
`billing:` completaron sin problema.

El mecanismo, ya localizado en el código:
[`app/api/stripe/webhook/route.ts:202`](../app/api/stripe/webhook/route.ts#L202)
devuelve `403` cuando `tenantAutorizado(studioDeCuenta, studioId)` falla —y ese
`return` **no marca el evento como procesado**. La reclamación caduca a los
120 s, Stripe reintenta, vuelve a dar 403, y el evento se queda en `procesando`
para siempre. El bono no lo entrega nunca el webhook: lo acaba entregando el
conciliador.

Esto significa que C-1 no es solo "los eventos van al destino equivocado".
Hay además **un desajuste entre la cuenta Connect que firma el evento y el
`studioId` de la metadata**, que el webhook detecta correctamente y rechaza —
como debe— pero sin dejar ninguna vía de resolución. Coincide con Sentry
`JAVASCRIPT-NEXTJS-15` (3 eventos).

**No he podido determinar POR QUÉ no cuadran** (haría falta ver la configuración
de Connect en el panel de Stripe). Es la primera pregunta que responder al
abordar C-1(1).

## I-3 · La ventana de 12 h del conciliador es un límite duro sin aviso

**Dónde.** `lib/inngest/conciliar-cobros.ts:38`, `VENTANA_HORAS = 12`.

**Por qué.** Está bien razonado en el comentario ("pasado un día ya no es un
retraso recuperable sin mirarlo a mano"), pero **no hay nada que mire a mano**: un
cobro que pase de 12 h sin entregar sale de la ventana y desaparece del sistema
sin dejar rastro ni tarea pendiente.

**Solución.** Un barrido diario de rango más amplio (72 h) que **no entregue**,
solo detecte y abra un aviso accionable. Separar "recuperar" de "detectar".

---

# 🟡 OPTIMIZACIÓN

## O-1 · Suelo de consumo de Inngest: ~41.000 pasos/mes, constante

Contando los ticks de los crons (no las ejecuciones por estudio):

| Frecuencia | Funciones | Ticks/día |
|---|---|---|
| */5 | `conciliar-cobros`, `lista-espera-ofertas`, `reservas-pendientes` | 864 |
| */10 | `penalizaciones` | 144 |
| */15 | `checkin-automatico`, `minimo-asistentes`, `notif-recordatorios` | 288 |
| */30 | `confirmacion-riesgo-corte` | 48 |
| diarios/semanales | 13 funciones | ~15 |
| **Total** | | **~1.359/día ≈ 41.300/mes** |

Es un **suelo fijo**: no baja con menos estudios ni sube con más. Con el plan free
(50.000 pasos/mes) queda ~17 % de margen, y ese margen es lo único que absorbe el
fan-out diario por estudio. **Con ~30-40 estudios el fan-out diario se come el
margen restante.**

Lo barato de recortar, por orden: `conciliar-cobros` de */5 a */10 (−144/día) una
vez arreglado C-1(1), ya que dejaría de ser el camino principal; y
`lista-espera-ofertas`/`reservas-pendientes` de */5 a */10 (−288/día) — el coste es
retraso de aviso, no corrección, porque en ambos la regla de negocio vive en la
RPC. Total: **−432 ticks/día (−31 %)** sin tocar ninguna garantía.

## O-2 · Advisors de Supabase: 87 avisos, ninguno grave

`get_advisors(performance)`: 65 `unused_index` (INFO), 20
`multiple_permissive_policies` (WARN), 2 `auth_rls_initplan` (WARN, en
`mensajes_equipo` y `cadena_tipos_clase`).

- Los 65 índices sin usar son sobre todo de módulos congelados (`videos_on_demand`,
  `challenge_*`, `achievement_history`, `citas`) — coherente con el feature-freeze,
  no hay nada que arreglar; su coste es escritura, y esas tablas casi no se
  escriben. **No tocar.**
- Los 2 `auth_rls_initplan` sí valen el arreglo (`auth.<fn>()` → `(select auth.<fn>())`):
  son dos líneas y evitan reevaluar por fila.
- Los 20 `multiple_permissive_policies` son consecuencia del modelo de roles; el
  arreglo real es consolidar políticas, y **no compensa** con 45 MB de datos.

---

# 🟢 CORRECTO — verificado, no tocar

Esto es lo que ya cumple el estándar. Lo dejo escrito para que no se "arregle" por
error en una pasada futura.

- **Los invariantes de duplicación están en la BD, no en la UI.** Verificado en
  `pg_indexes`:
  - `uq_reserva_activa_socio_sesion` — parcial sobre `(sesion_id, socio_id)` para
    los estados vivos: **imposible duplicar reserva**.
  - `uq_reserva_spot_activo` — **imposible dos socias en la misma plaza**.
  - `uq_notification_dedup` sobre `(studio_id, dedup_key)` — **imposible duplicar
    notificación**.
  - `penalizaciones (reserva_id, tipo)` UNIQUE — **imposible penalizar dos veces**.
  - `instructores (auth_user_id, studio_id)` UNIQUE.
- **Idempotencia de webhooks bien resuelta.** `reclamar_webhook_event` hace
  check-y-marca en una sola sentencia (cierra la carrera del SELECT-then-INSERT),
  la reclamación **expira sola** (no enmascara fallos como "procesado"), y va
  **prefijada por ámbito** (`connect:` / `billing:`) para que los dos webhooks no
  se pisen. El fail-open ante error de RPC está razonado y es la elección correcta
  (reprocesar es seguro, saltarse un pago no).
- **Cero errores tragados.** 0 `catch {}` reales en `lib/` y `app/` (los 2 que
  aparecen en grep son comentarios). Los 28 `catch` con comentario son degradaciones
  deliberadas y documentadas.
- **Los crons de alta frecuencia son de un solo `step.run` y query global.** La
  decisión de colapsar el fan-out está bien tomada y bien comentada; el único
  descuido es la paginación (C-2), no el diseño.
- **Los 3 crons de Vercel están autenticados con `CRON_SECRET`** y son idempotentes.
- **Sentry sano y bien calibrado.** `tracesSampleRate: 0.1` en server y edge, 9
  issues en 30 días con máximo 8 eventos, `ignoreErrors` para el ruido de WebKit.
  **No hay ningún error en bucle, ni eventos duplicados, ni consumo desbocado.**
  La pregunta "¿hay algo en loop?" tiene respuesta medida: **no.**
- **Sin duplicación entre Vercel Cron e Inngest.** Trabajos disjuntos.

---

# Mapa de consumo y dónde rompe primero

```
SOCIA / PROPIETARIA
   ↓ (Next.js en Vercel, fra1)
VERCEL ──── 3 Vercel Cron (barridos globales, 300 s)  ← rompe 3º (I-1, por tiempo)
   ↓
SUPABASE ── PostgREST, tope 1.000 filas silencioso    ← rompe 1º (C-2, ~10-50 estudios)
   ↓          45 MB / 8 GB · statement_timeout 8 s
INNGEST ─── 21 funciones · suelo 41.300 pasos/mes     ← rompe 2º (O-1, ~30-40 estudios)
   ↓          (free: 50.000)
STRIPE ───── conciliador */5 · 1 llamada/estudio/tick ← rompe 4º (C-1, rate limit)
   ↓          + truncado a 100 sin paginar            ← rompe YA en picos de venta
SENTRY ───── sampling 0,1 · 9 issues/30d              ← sin riesgo a la vista
```

**Orden real en que se rompe al crecer**, que es lo que responde a tu pregunta de
proyección: no es Vercel ni el coste de Supabase, es **el tope de 1.000 filas de
PostgREST**, y llega mucho antes de los 100 estudios.

## Proyección

| | 10 (hoy) | 100 | 1.000 | 10.000 |
|---|---|---|---|---|
| Pasos Inngest/mes | 41,3k (suelo) + fan-out | ~48k ⚠️ cuota | ~110k | ~750k |
| Llamadas Stripe/día (conciliador) | 2.880 | 28.800 | 288.000 ❌ rate limit | — |
| Reservas en ventana 25 h | ~200 ✅ | ~2.000–10.000 ❌ trunca | ❌ | ❌ |
| Tamaño BD | 45 MB ✅ | ~450 MB ✅ | ~4,5 GB ⚠️ | ~45 GB ❌ |
| Duración `no-shows` | segundos ✅ | ~decenas de s ⚠️ | >300 s ❌ | ❌ |

La BD **no es el problema** en ningún escenario realista a medio plazo (a 1.000
estudios sigue cabiendo). El problema es siempre el mismo patrón: **lecturas sin
paginar y barridos sin cursor**.

---

# Orden de trabajo propuesto

Siguiendo tu regla final (estabilidad antes que funcionalidad):

1. **C-1(1)** — arreglar el destino de eventos en Stripe. Es configuración, no
   código, y para la sangría de hoy. ⬅️ **PENDIENTE, requiere el panel de Stripe**
2. ✅ **C-1(2)** — paginar `conciliar-cobros` + aviso al tocar el techo. *Hecho.*
3. ✅ **C-2** — paginado en los 5 crons globales + test de regresión. *Hecho.*
4. ✅ **C-3** — `idsEstudios()` + `fetchAllRows` en los 14 sitios. *Hecho.*
5. ✅ **I-0** — N+1 de `minimo-asistentes` sustituido por una lectura agregada.
   *Hecho.*
6. ✅ **I-2** — `/api/health` y `/api/health/flujos`. *Hecho.*
7. ✅ **I-1** — los 3 barridos de Vercel. *Hecho.*
8. **I-3** — barrido de detección a 72 h.
9. **O-1** — bajar `conciliar-cobros`, `lista-espera-ofertas` y
   `reservas-pendientes` a */10 (−31 % de ticks).
10. **O-2** — los 2 `auth_rls_initplan`. Lo demás de advisors, no tocar.

## Estado del arreglo (2026-08-11)

Hecho en `claude/tentare-reliability-standard-a9f76d`:

- `conciliar-cobros.ts` — `for await` (autopagina) + techo defensivo de 2.000 con
  aviso a Sentry (`tipo: techo-paginado`). Nunca corta en silencio.
- `notif-automations.ts`, `lista-espera-ofertas.ts`, `reservas-pendientes.ts`,
  `minimo-asistentes.ts`, `checkin-automatico.ts` — lecturas globales envueltas
  en `fetchAllRows`.
- `estudios.ts` (nuevo) + 14 sitios — la lista de estudios de cada fan-out va
  paginada (C-3).
- `minimo-asistentes.ts` — el `count` por sesión dentro del bucle pasa a una sola
  lectura agregada contada en JS (I-0).
- `lib/inngest/crons-paginacion.test.ts` — test de regresión nuevo, 19 casos.
  **Verificado que falla de verdad** en las dos familias: quitando un `.range()`
  a un cron global da `fail 1`, y quitándoselo a `dunning` (lista de estudios)
  también.

Verificación: `npx tsc --noEmit` limpio · `npm test` **2.114/2.114** ·
`eslint lib/inngest --max-warnings 0` limpio.

Y de I-2:

- `lib/salud/comprobaciones.ts` + `lib/salud/secreto.ts` + los dos endpoints.
- `lib/salud/salud.test.ts` — 10 casos. El que más importa:
  **con `CRON_SECRET` sin configurar, el endpoint no autoriza a nadie** (sin esa
  guardia, `Bearer ` + `''` compararía dos cadenas iguales y quedaría abierto).
- Verificado en vivo contra el servidor de desarrollo, las tres puertas:
  secreto correcto → pasa; secreto incorrecto → 401; sin cabecera → 401. Y las
  dos ramas del import diferido: sin config → 503 legible, con config → 401.
- La sintaxis del embed `sesiones!inner(...)` con `count` se validó contra el
  PostgREST real con control positivo y negativo (200 con la relación buena,
  400 `PGRST200` con una inventada) — no se dio por buena de memoria.

⚠️ **Un fallo de diseño que salió al probarlo**: `exigirPermiso` arrastra
`lib/auth-server.ts` → `lib/db/supabase.ts`, que hace `createClient` **a nivel de
módulo** y lanza si falta `NEXT_PUBLIC_SUPABASE_URL`. Importado arriba, tumbaba
el endpoint con un 500 y un stack **antes de ejecutar una sola línea propia** —
justo el endpoint cuyo trabajo es avisar de que algo está mal configurado. Se
resolvió difiriendo el import al handler. La coupling es preexistente y la
comparten todas las rutas de `/interno`; ahí es tolerable (sin config no hay
app), aquí no.

⚠️ **Nota de método**: en una pasada intermedia faltaba el `import` de
`fetchAllRows` en `conciliar-cobros.ts` y **la suite pasó igualmente** — el test
de regresión lee el fuente como texto, así que ve el `.range()` pero no compila
nada. Lo cazó `tsc`. Son comprobaciones complementarias, no redundantes: el test
protege la *intención*, `tsc` protege que el código *exista*.

**No verificado end-to-end**: no hay Stripe test mode ni Supabase local en este
entorno, así que el autopaginado real contra >100 sesiones y el paginado real
contra >1.000 filas no se han ejecutado — están cubiertos por el test de
estructura, que es otra cosa. Antes de confiar en C-1 conviene forzar un caso
real en un estudio de prueba.

## Lo que NO he podido verificar

Para que no se dé por auditado lo que no lo está:

- **La configuración de destinos de webhook en Stripe**: no tengo acceso al panel
  de Stripe desde aquí. C-1(1) está inferido de los tres mensajes de Sentry y del
  comentario del código, que coinciden; conviene confirmarlo en el panel antes de
  tocar nada.
- **Consumo real facturado de Vercel e Inngest**: las cifras de O-1 son calculadas
  a partir del cron schedule del repo, no leídas de la factura. El orden de
  magnitud es sólido; el número exacto hay que contrastarlo con el panel.
- **Duración real de los 3 barridos de Vercel**: I-1 es un razonamiento sobre el
  techo de 300 s, no una medición. Hay que instrumentarlo para saber el margen.
- **El comportamiento del truncado a 1.000 filas en vivo**: confirmado que el
  patrón ya mordió en este repo (PR #684) y que los 7 crons no paginan, pero no he
  sembrado 1.000+ filas para reproducirlo. El test de regresión de C-2(3) es
  justamente eso.
