# Auditoría Tentare — 20ª pasada · 1 de septiembre de 2026

Rama auditada: `origin/main` @ `f5d48c7d`.
Base de datos: producción `dwqvdycjcffqwfkzapvi`, verificada en vivo (solo lecturas + una transacción con ROLLBACK).
Delta desde la última auditoría: **154 commits, 1.041 ficheros, +30.423/−38.794**.

---

## 0. LA TRAMPA DE ESTA PASADA (otra vez el árbol local)

El árbol de `/Users/marcosrocarodriguez/dev/o` estaba en la rama
`claude/theme-builder-imagen-rota`, **172 commits y 7 días por detrás de `main`**.
Auditar ahí habría sido auditar código que ya no existe — el fallo del 19-ago
repetido. Toda esta auditoría se ha hecho sobre un worktree limpio de
`origin/main`.

**Esto ya es un patrón, no un accidente: es la tercera vez.** La primera
comprobación de cualquier auditoría futura debe ser `git rev-list --left-right
--count HEAD...origin/main`.

---

## ESTADO REAL DE TENTARE

| | |
|---|---|
| **Estado general** | Sólido en lo estructural. La familia §1 (escritura optimista sin revertir) sigue CERRADA en reservas y dinero — pero ha **reaparecido intacta en el código nuevo de Comunidad**, que nadie había auditado. |
| **Riesgo técnico** | Medio. El código nuevo es bueno; el problema es que se replica el patrón viejo en cada superficie nueva. |
| **Riesgo de seguridad** | Medio-alto antes de esta pasada. Un 🔴 real y explotable en el webhook de Stripe (credenciales de cobro escribibles cruzando estudios), ya cerrado. |
| **Riesgo de datos** | Bajo. **No he encontrado ninguna fuga cross-tenant explotable hoy** tras recorrer las 15 tablas nuevas en producción con impersonación real. |
| **Riesgo de negocio** | El de siempre y sin resolver: **el cobro real de Stripe del 21-sep**. Sigue sin red de recuperación para un estudio suspendido. |
| **Deuda técnica** | Concentrada en un sitio: **funcionalidad entregada a medias**. Documentos que el estudio no puede reabrir, mensajería sin badge, lista de espera inerte en los 10 estudios. |
| **Áreas más problemáticas** | Comunidad (nueva, sin auditar), Documentos de socia (nueva), Plazas numeradas/spots (nueva), POS (congelado pero roto). |

### El hallazgo que más me preocupa, y no es un bug

`novedades_estudio` nació el 26-ago con la policy
`for select to anon using (true)` — **exactamente la forma que la migración
`20260820165632_cierra_lectura_anon_cross_tenant` había eliminado seis días
antes de nueve tablas**, con dos páginas de comentario explicando por qué era
peligrosa.

El arreglo del 20-ago cerró las tablas que existían pero no dejó **regla** que
impidiera reescribir el patrón en la tabla siguiente. Es la definición de deuda
técnica que se reproduce sola. Recomendación de arquitectura al final (§4).

---

# 🔴 CRÍTICOS

### [F-1] El webhook de Stripe escribía credenciales de cobro sin comprobar de quién es la cuenta

**Severidad:** 🔴 Crítico · **Área:** Pagos / Multi-tenancy · **Estado: ✅ SOLUCIONADO**

**Archivo:** `app/api/stripe/webhook/route.ts:269-354` (antes del fix).

**Evidencia.** La comprobación de tenant vivía **dentro del `else`**, en la línea 347:

```ts
269:  if (session.mode === 'setup' && session.metadata?.purpose === 'tarjeta') { … }
306:  } else if (session.mode === 'setup' && session.metadata?.purpose === 'sepa_mandate') { … }
333:  } else {
347:      const studioDeCuenta = await studioDeCuentaConnect(admin, event.account);
348:      if (!tenantAutorizado(studioDeCuenta, studioId)) { … 403 }
```

Las dos ramas `setup` retornan **antes** de llegar a la 347. Sus escrituras se
guían solo por metadata, que la elige quien crea la sesión:

- tarjeta (293): `.eq('id', socioId).eq('studio_id', studioId)` — ambos de `session.metadata`.
- SEPA (326): `.eq('id', socioId)` — **sin acotar por estudio en absoluto**.

**Qué ocurre.** Un estudio con cuenta Connect podía crear en SU cuenta un
Checkout `mode:'setup'` con `metadata = { socioId: <socia ajena>, studioId:
<otro estudio>, purpose: 'sepa_mandate' }`, completarlo, y el webhook
sobrescribía el mandato SEPA y el `stripe_customer_id` de una socia de otro
estudio con ids que no existen en la cuenta de ese estudio.

**Impacto.** Las renovaciones y cobros off-session del estudio víctima apuntan a
un método de pago inexistente en su cuenta: fallan todos, en silencio, y el
dunning los contabiliza como rechazos legítimos de la socia.

**Por qué ocurrió.** Es literalmente el fallo que `lib/billing/webhook-tenant.ts`
documenta haber cerrado —"la rama de compra de plan no comprobaba nada en
absoluto"—. Se cerró el camino de pago y se dejó abierto su gemelo de `setup`.
**La misma clase de fallo que el 21-ago y el 23-ago.**

**Cómo reproducirlo.** Cuenta Connect A, Checkout `mode:'setup'` con metadata
apuntando a una socia del estudio B, completar el SetupIntent, observar
`socios.sepa_payment_method_id` de B sobrescrito.

**Solución aplicada.** Subir `studioDeCuentaConnect` + `tenantAutorizado` por
encima del reparto en ramas, de modo que cubra las tres; y acotar el UPDATE de
SEPA por `studio_id` exigiéndolo, igual que ya hacía su gemelo de tarjeta.

**Riesgo residual.** Ninguno funcional: `setup-tarjeta` y `setup-sepa` crean
siempre la sesión sobre la cuenta conectada, así que `event.account` viene
informado y ningún camino legítimo pierde autorización (mismo razonamiento que
`webhook-tenant.ts` ya documenta). Una sesión sin pagar de cuenta desconocida
pasa de responder 200 a 403, sin efecto práctico porque el valor de retorno se
descarta (ver F-12).

---

### [F-2] Borrar un aviso del tablón de Comunidad no comprobaba que se hubiera borrado

**Severidad:** 🔴 Crítico · **Área:** Comunidad (nueva) · **Estado: ✅ SOLUCIONADO**

**Archivos:** `lib/stores/use-content-store.ts:91-93, 137-145`, `lib/supabase-data.ts:3520, 3574-3577`.

**Evidencia.**

```ts
function deletePost(postId: string) {
  setPostsComunidad(prev => prev.filter(p => p.id !== postId));
  void dbDeletePostComunidad(postId);          // ← no devolvía nada
}
```
```ts
// lib/supabase-data.ts:3520
// Best-effort: si falla, el post ya se pintó optimista y solo se reporta.
```

**Qué ocurre.** La propietaria borra un aviso del tablón —un precio mal puesto,
un dato personal de una socia—, desaparece de su pantalla, y si el DELETE falló
**el post sigue sirviéndose a todas las socias**: el feed público
(`GET /api/public/comunidad/posts`) lee la tabla con service-role, no el estado
local del panel. Lo mismo al publicar: aparece publicado y no llegó ni a la BD
ni al fan-out de notificación.

**Por qué ocurre.** La familia §1 reintroducida entera en código nuevo. La
propia store tiene el patrón correcto tres funciones más arriba
(`toggleLikePost` revierte al fallar); publicar/editar/borrar no lo siguieron.

**Solución aplicada.** `dbDeletePostComunidad` y `dbCrearPostComunidad` ahora
devuelven `boolean`; la store retira el post optimista si el servidor rechaza y
**repone el borrado en su posición exacta** (el tablón mezcla fijados y no
fijados: reordenar por fecha lo movería de sitio).

**Decisión consciente:** `updatePost` (editar el texto) se deja optimista. Un
texto que la propietaria ya ha releído y dado por bueno en pantalla genera más
confusión revirtiéndose que dejándolo hasta el próximo refresco, y no tiene el
efecto "sigue publicado sin saberlo" que sí tienen borrar y publicar.

---

# 🟠 IMPORTANTES

### [F-3] Las devoluciones de POS eran un no-op integral, con el test en verde

**Severidad:** 🟠 · **Área:** Pagos · **Estado: ⚠️ PARCIALMENTE SOLUCIONADO**

**Archivos:** `lib/billing/procesar-reembolso.ts:237-277`, `lib/supabase-data.ts:1500-1513`, `lib/types.ts:1063`.

**Evidencia — verificada en producción:**

```sql
select count(*) total, count(stripe_payment_intent_id) con_pi from ventas_pos;
--  total | con_pi
--     19 |      0
```

`procesarReembolsoVentaPos` localiza la venta por
`.eq('stripe_payment_intent_id', …)`. La columna existe desde
`0036_pagos_espana_sepa_bizum` y `RowVentasPos` la declara —pero **ni la
interfaz `VentaPOS` ni `ventaPOSToDb` ni `mapVentaPOS` la incluían**, así que
nadie la escribía nunca. El predicado no casaba jamás.

**Por qué pasó los checks.** `procesar-reembolso.test.ts` usa un `fakeAdmin` que
devuelve siempre una fila: verifica el UPDATE pero **no evalúa ningún
predicado**. Verde con el fix muerto. Es el mismo mecanismo por el que el 20-ago
3 de 9 fixes estaban rotos con todo en verde.

**Solución aplicada.** Campo añadido al tipo y a los dos mappers; comentario del
encabezado corregido (afirmaba en primera persona algo falso: *"`ventas_pos` ya
lo guarda al cobrar"*); **dos tests de regresión nuevos** que sí miran el código.

**Qué queda pendiente.** Que los cobros POS con Stripe (`/api/stripe/pos-bizum`,
`/api/terminal/cobrar`) informen el campo al registrar la venta. No lo he hecho
porque la venta se crea desde `app/(dashboard)/pos/page.frozen.tsx` —el POS está
**congelado** (`lib/frozen-features.ts`)— y cablearlo es trabajo de producto
sobre una función apagada, no una reparación. **Riesgo hoy: nulo. Al
descongelar el POS: los reembolsos de datáfono/Bizum siguen sin revertir nada.**

**Además:** el conciliador (`lib/inngest/conciliar-reembolsos.ts:155`) filtra por
`ORIGENES_CON_RECIBO` y nunca llama a `procesarReembolsoVentaPos`. Los
reembolsos POS no tienen red de seguridad de ningún tipo. ⏳ Pendiente, misma
razón.

---

### [F-4] El guard anti-doble-suscripción no cubría el plan CADENA

**Severidad:** 🟠 · **Área:** Pagos · **Estado: ✅ SOLUCIONADO**

**Archivo:** `app/api/billing/checkout/route.ts`.

El 409 que impide contratar dos veces estaba en la línea 181, **después** del
`return` de la rama CADENA (línea 168). `cadena.subscription_status` se leía dos
veces (líneas 90 y 113) y **no se usaba nunca**.

Una propietaria con CADENA activa que volviera a pulsar "Contratar" (doble clic,
caché desincronizada, replay) abría un segundo Checkout de suscripción sobre el
mismo customer: **dos suscripciones CADENA cobrando en paralelo**. Es
exactamente el escenario que el comentario de las líneas 171-176 dice haber
cerrado — se comprobó en la rama individual y no en su gemela.

**Solución aplicada:** mismo guard, mismo `suscripcionActiva()` (que incluye
`past_due` a propósito), dentro de la rama CADENA antes de crear la sesión.

---

### [F-5] `setup-sepa` no tenía la guarda de modo que sí tiene `setup-tarjeta`

**Severidad:** 🟠 · **Área:** Pagos · **Estado: ✅ SOLUCIONADO**

`app/api/stripe/setup-tarjeta/route.ts:43` llama a `comprobarModoStripe()` con el
comentario *"misma guarda de modo que las dos puertas por las que entra
dinero"*. `setup-sepa` no la importaba siquiera. Con claves cruzadas test/live
se da de alta un mandato SEPA en el modo equivocado, que solo se descubre al
fallar el primer cobro de la mensualidad. Añadida.

---

### [F-6] Un segundo reembolso parcial se perdía, contra lo que prometía su propio comentario

**Severidad:** 🟠 · **Área:** Pagos · **Estado: ✅ SOLUCIONADO**

`lib/billing/procesar-reembolso.ts:251-259`. El guard `.is('devuelta_en', null)`
hacía lo contrario de lo que su comentario decía (*"…ni perder el importe
acumulado real si hubo un segundo parcial"*): tras el primer parcial la fila ya
no casaba, así que el segundo parcial —o el paso de parcial a total— no
actualizaba `importe_devuelto`.

**Solución:** guard sobre el acumulado (`importe_devuelto is null or <
nuevo`), que es monótono porque Stripe manda siempre `amount_refunded` total y
no el delta: frena el reintento exacto y deja pasar todo incremento real. Test
de regresión añadido.

---

### [F-7] Plazas numeradas: asignar sitio era mudo, y podía bloquear las cancelaciones de la clase

**Severidad:** 🟠 · **Área:** Reservas (nueva) · **Estado: ✅ SOLUCIONADO** (dos bugs)

**Archivos:** `lib/studio-context.tsx:3343-3352`, `app/(dashboard)/calendario/page.tsx:2579`, `components/spots/spot-map.tsx:154-169`.

**Bug A — no-op mudo.** El panel ofrece para asignar **todas** las socias activas
del estudio, incluidas las que no tienen reserva en esa clase. `asignarSpot`
devuelve `{ok:false, error:…}` para esas — pero el prop está tipado
`(spotId, socioId) => void` y el llamante **descartaba el resultado**. Recepción
tocaba un reformer, elegía una clienta, el panel se cerraba y no pasaba nada:
ni asignación, ni error, ni toast. Igual cuando el índice único rechazaba la
escritura: el sitio "volvía solo" sin explicación.

**Bug B — spot en lista de espera bloquea la cancelación.** El índice único de
producción es **parcial**:

```
uq_reserva_spot_activo ON reservas (sesion_id, spot_id)
  WHERE spot_id IS NOT NULL AND estado IN ('CONFIRMADA','ASISTIDA')
```

`asignarSpot` filtraba por `estado !== 'CANCELADA'`, así que podía escribir
`spot_id` en una fila `LISTA_ESPERA`, donde el índice no aplica y la escritura
pasa; la UI tampoco la pintaba (solo indexa confirmadas), con lo que el sitio
seguía "Libre". Al promocionarla después, la fila entra en el predicado del
índice, choca con la confirmada que ya ocupa el spot, y el **23505 aborta la
transacción entera de `cancelar_reserva_plaza`**: la socia que cancelaba no
podía cancelar y la cola de esa clase quedaba bloqueada.

Estado en producción: `LISTA_ESPERA` = 1 fila, 0 con spot. **Latente, no
manifiesto** — pero el camino estaba abierto desde el panel.

**Solución aplicada.** `asignarSpot` acepta solo `CONFIRMADA`/`ASISTIDA` (lo que
el índice protege) con mensaje específico si la clienta está en espera; y el
llamante muestra el error por toast.

---

### [F-8] `novedades_estudio` legible por `anon` sin filtro de estudio

**Severidad:** 🟠 · **Área:** RLS · **Estado: ⚠️ MIGRACIÓN ESCRITA Y VERIFICADA, SIN APLICAR**

`supabase/migrations/20260826220000_novedades_estudio.sql:47-48`:

```sql
create policy public_read_novedades_estudio on public.novedades_estudio
  for select to anon using (true);
```

Sin `studio_id`: con la clave anónima —que es pública— se leería el tablón
interno de **todos** los estudios de la plataforma.

**No filtra hoy** porque `anon` nunca recibió el GRANT: la lectura muere con
`42501` antes de evaluar la policy. Es el mismo desajuste policy↔grant que
produjo el no-op del 14-ago, esta vez a nuestro favor. **No es seguro dejarlo
así:** basta que alguien conceda el SELECT para "arreglar" el 42501 —que es lo
natural al verlo— para abrir la fuga entera.

Ver §0: es la migración del 20-ago deshecha por código nuevo.

---

### [F-9] Una instructora podía borrar y fabricar sus propias valoraciones

**Severidad:** 🟠 · **Área:** RLS · **Estado: ⚠️ MIGRACIÓN ESCRITA Y VERIFICADA, SIN APLICAR**

`admin_valoraciones` (`0044_valoraciones.sql:48`) es `FOR ALL` con el único
predicado `studio_id = current_studio_id()`, **sin comprobación de rol**, y la
tabla lleva `GRANT ALL ... TO anon, authenticated`. `current_studio_id()`
resuelve para propietarias **e instructoras**.

Verificado en producción por impersonación de una instructora real
(`07c25aac…`):

```
rol_real=INSTRUCTOR | pasa_predicado_ALL=true
grant_upd_valoraciones=true | grant_del_valoraciones=true
```

`valoraciones` alimenta `valoraciones_resumen_estudio()`, o sea las estrellas de
Equipo y **el ranking con el que se reparten las sustituciones**. La parte
evaluada controlaba su propia nota. La escritura legítima no pasa por aquí: las
crea la alumna vía `/api/public/valorar` con service-role. Verificado por grep
exhaustivo: **no existe ni un solo `.from('valoraciones')` con la clave del
navegador** en `lib/`, `app/` ni `components/`. La policy de escritura era
código muerto, pero explotable.

**La tabla hermana lo hace bien:** `admin_novedades_estudio` sí exige
`current_rol() in ('PROPIETARIO','MANAGER')`. Es el patrón de la casa, no
aplicado aquí.

**Migración F-8 + F-9:** `supabase/migrations/20260901120000_cierra_anon_novedades_y_escritura_valoraciones.sql`.
**Verificada en vivo** con `execute_sql` + control positivo + `ROLLBACK`
—el método que la propia casa documenta tras el no-op del 14-ago—: antes
`policy anon = 1`, `cmd = ALL`, `authenticated UPDATE = true`; después `0`,
`SELECT`, `false`. Confirmado además que **producción quedó intacta** tras el
rollback. **No la he aplicado a producción**: aplicar DDL sin supervisión en una
ejecución programada es peor riesgo que un desajuste hoy inerte. Va en el parche.

---

### [F-10] Cancelar una clase desde Sustituciones devolvía `{ok:true}` con las reservas vivas

**Severidad:** 🟠 · **Área:** Reservas · **Estado: ✅ SOLUCIONADO**

`app/api/sustituciones/route.ts:376-391`. Si el UPDATE de reservas fallaba, tres
cosas quedaban mal a la vez y **ninguna se veía**:

1. reservas fantasma `CONFIRMADA` sobre una clase que ya no existe, consumiendo
   cupo semanal y `maxSimultaneas` — justo lo que el comentario de las líneas
   360-364 dice ir a evitar;
2. **ningún bono devuelto**, porque `devolverBonosPorCancelacionClase` cuelga del
   `else`;
3. solo un `console.error`, que **no llega a Sentry**.

Y la respuesta seguía siendo `{ok:true}`, con la UI diciendo *"Clase cancelada.
N de M alumnas avisadas"*. Su gemelo del panel (`lib/studio-context.tsx:2545`)
**sí** avisa: *"La clase se ha cancelado, pero no hemos podido cancelar sus
reservas"*.

**Solución aplicada:** `Sentry.captureMessage` con `queHacer`, y un campo
`aviso` propagado por `lib/api-client.ts` hasta
`app/(dashboard)/sustituciones/page.tsx`, mostrado como error (rojo, sin
autocierre) porque es trabajo pendiente para la propietaria, no una
confirmación.

---

### [F-11] El feedback del centro de ayuda: 0 filas en 4 días y nadie podía saberlo

**Severidad:** 🟠 · **Área:** Observabilidad · **Estado: ✅ SOLUCIONADO**

`components/ayuda/AyudaFeedback.tsx:24-33` mostraba "Gracias por decírnoslo"
optimista con un `catch {}` **vacío**, y
`app/api/ayuda/feedback/route.ts:35` devolvía `{ok:true, skipped:true}` —un
éxito falso indistinguible— cuando no hay service role.

En producción `ayuda_feedback` tiene **0 filas** tras 4 días publicado. Con el
catch vacío no había forma de saber si es que nadie vota o es que ningún voto
llega.

**Solución aplicada:** el "Gracias" optimista se queda (es feedback, no dinero:
molestar a quien solo quería opinar es peor), pero el fallo se reporta a Sentry
con contexto, y el `!db` pasa a 503 como en el resto del repo. **Nota: sigo sin
saber por qué hay 0 filas** — el fix hace que se sepa a partir de ahora.

---

### [F-12] `procesarEvento` devuelve códigos 5xx que nadie recibe

**Severidad:** 🟠 · **Área:** Pagos / Observabilidad · **Estado: ⏳ PENDIENTE**

`app/api/stripe/webhook/route.ts:169-181`. Desde que el webhook responde 200
**antes** de procesar (`after(...)`), el valor de retorno de `procesarEvento` se
descarta — lo dice su propio JSDoc. Pero ~20 caminos de fallo siguen escritos
como si el 5xx sirviera, y varios solo hacen `console.error` sin Sentry:

```ts
420:  console.error('[stripe webhook] no se pudo marcar el recibo como COBRADO', reciboId, error);
421:  return NextResponse.json({ error: 'Fallo al persistir el cobro' }, { status: 500 });
```

Y el comentario que lo justifica (línea 260) ya no es cierto: *"cualquier fallo
de escritura devuelve un 5xx para que Stripe REINTENTE la entrega"*. **Stripe ya
recibió 200. No reintenta.** Mismos casos mudos en 296, 328, 612, 652, 824, 925,
974, 1012, 1053, 1115, 1199, 1262, 1402…

**Por qué no lo he arreglado.** Son ~20 puntos y la decisión correcta no se
deduce del código: hay que elegir entre (a) convertir los `console.error` en
`Sentry.captureMessage` dejando la firma como está, o (b) rediseñar
`procesarEvento` para que señale el fallo al conciliador. Es una decisión
arquitectónica sobre la red de recuperación del dinero, no un fix. **Lo mitiga
parcialmente `conciliar-cobros`, salvo lo que dice F-13.**

---

### [F-13] El conciliador recupera el cobro pero no sella la factura

**Severidad:** 🟠 · **Área:** Pagos / Cumplimiento · **Estado: ⏳ PENDIENTE**

`lib/inngest/conciliar-cobros.ts:337-352` vs `app/api/stripe/webhook/route.ts:398-473`.
Para el mismo hecho, el webhook además escribe `stripe_payment_intent_id` y
llama a `sellarFacturaDeRecibo`. El conciliador **no hace ninguna de las dos**
(`grep -n "sellar\|factura" lib/inngest/conciliar-cobros.ts` → nada).

Como el conciliador es ahora *la* red de seguridad (F-12), todo cobro que
recupera queda **sin factura sellada y sin aviso** (el webhook al menos avisa
cuando el sellado falla; aquí ni se intenta) y sin PaymentIntent guardado, de
modo que "Devolver" desde el panel depende de `paymentIntents.search`, que el
propio código reconoce que tarda ~1 min en indexar.

**Por qué no lo he arreglado:** tiene implicaciones fiscales (Fiskaly / sellado
de facturas). No toco sellado de facturas sin que lo decidas tú.

---

### [F-14] Documentos de socia: el estudio no puede reabrir ningún documento que sube

**Severidad:** 🟠 · **Área:** Documentos (nueva) · **Estado: ⏳ PENDIENTE**

Verificado en producción: para el bucket privado `documentos-socio` solo existen
policies de INSERT y de service_role. **No hay SELECT para `authenticated`.**
`components/socios/ficha-documentos.tsx` no tiene ni un `<a href>` ni ninguna
llamada a `createSignedUrl`; la única firma existe en
`app/api/public/documentos-socio/route.ts:64`, solo para la socia dueña.

El estudio sube un contrato y ya no puede volver a verlo. Si lo sube a la socia
equivocada, no hay forma de detectarlo desde el panel — solo lo verá la socia a
la que llegó, **con aviso PUSH + EMAIL**.

**Por qué no lo he arreglado:** falta una ruta nueva de URL firmada para staff.
Es funcionalidad que no existe, no un bug que reparar; y decidir quién puede
reabrir un documento (¿toda staff? ¿solo propietaria?) es decisión de producto.

---

### [F-15] Mensajería: el mostrador nunca enciende el badge de "sin leer"

**Severidad:** 🟠 · **Área:** Mensajería (nueva) · **Estado: ⏳ PENDIENTE**

`abrir_conversacion` (RPC en prod) **no inserta fila STAFF** para
`ALUMNA_MOSTRADOR` ni `EQUIPO`. Verificado: prod tiene 5 conversaciones y solo 2
filas en `conversacion_participantes`, ambas `rol_en_conversacion='SOCIO'`.
Y `lib/mensajeria/presentacion.ts:171`:

```ts
export function tieneSinLeer(c, miAuthUserId): boolean {
  if (!c.leido_hasta) return false;      // ← staff: siempre false
```

Una socia escribe al mostrador —**el canal principal socia→estudio**— y en el
panel no se enciende ningún contador. El digest de pg_cron tampoco los cubre
(consulta la misma tabla). El único canal que llega es PUSH, y en las 6 entregas
reales del 31-ago sale `PUSH:SKIPPED err="sin suscripción push"` para el staff.

**Por qué no lo he arreglado:** hay dos diseños válidos (insertar fila STAFF al
abrir el hilo, o resolver `tieneSinLeer` por rol) y elegir mal deja el badge
encendido para siempre o duplica filas en el backfill. Decisión tuya.

---

### [F-16] Elegir sitio y no conseguirlo: dos superficies lo dicen, dos lo callan

**Severidad:** 🟠 · **Área:** Reservas · **Estado: ⏳ PENDIENTE**

`asignarSpotReserva` devuelve `null` en tres casos legítimos (carrera, spot
desactivado, spot de otra sala) y `crearReservaPublica` responde
`{ok:true, spotAsignado:null}`.

`components/portal/portal-clases-view.tsx:396-405` **sí** avisa: *"Reservada,
pero el sitio que elegiste lo cogieron antes"*. Sus gemelas no miran
`spotAsignado` y dicen "Reservada. Te esperamos.":
`app/portal/[slug]/clases/[sesionId]/page.tsx:191-197` y
`app/reservar/[slug]/page.tsx:2011-2022` (widget público).

**Por qué no lo he arreglado:** las tres superficies construyen el mensaje de
formas distintas y unificarlas bien pide extraer un helper compartido. Es
refactor, y la regla es no hacer refactors amplios sin necesidad demostrada en
la misma pasada en que ya he tocado ese archivo por F-7. Lo dejo señalado con la
solución concreta.

---

# 🟡 MEJORAS

| ID | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| F-17 | **6 errores `42501` en Sentry** (7 días): `dbMisLikesComunidad`, `respuestas_cuestionario_salud`, `campos_personalizados`, `plantillas_email`, `segmentos_clientes`, `instructor_dependency_snapshots`. Son fetches de cliente que se disparan para visitantes `anon` en `/login` y `/network`. Fallan cerrados (bien), pero ensucian Sentry y significan que se piden datos que no tocaba pedir. | Sentry `tentare-software`, `is:unresolved` | ⏳ |
| F-18 | `admin_posts_comunidad` y `admin_comentarios_comunidad` son `FOR ALL` sin comprobación de rol: cualquier staff puede borrar/fijar cualquier post y escribir `autor_id`/`autor_nombre` a mano (suplantar a la propietaria). `admin_novedades_estudio` sí exige rol. | prod, `pg_policies` | ⏳ |
| F-19 | El `id` del post de comunidad lo elige el cliente (`app/api/comunidad/posts/route.ts`), en un insert con service-role. Oráculo de existencia cross-tenant (23505 → 500 vs 200). | código | ⏳ |
| F-20 | Bucket `comunidad-media` es `public=true`. Sus policies acotan por estudio pero el endpoint público de Storage no evalúa RLS. Combinado con F-19, la URL es predecible. Está documentado como decisión deliberada (mismo patrón que `avatars`). | prod, `storage.buckets` | 🔎 decisión de producto |
| F-21 | Grants a `anon` demasiado anchos en `socios`, `posts_comunidad`, `valoraciones`, `ventas_pos`, `spots`. Hoy fail-closed (0 filas, verificado), pero lo único que separa a un anónimo de la tabla de socias es la ausencia de una policy permisiva. | prod | ⏳ (F-9 cierra `valoraciones`) |
| F-22 | `webhook_reembolsos` y `webhook_disputas` son las **únicas dos** tablas de `public` con `relrowsecurity = false` y 0 policies. Sin grants a cliente, así que no son alcanzables hoy. | prod, `pg_class` | ⏳ |
| F-23 | `/api/public/social/clase/[sesionId]` no exige que la socia tenga reserva en esa sesión: cualquiera puede enumerar sesiones y ver el nombre de toda asistente con `visible_en_clase`. El opt-in se llama "visible **en clase**". | código | ⏳ |
| F-24 | Apuntarse a un evento no comprueba `audiencia`: una socia fuera del segmento puede hacer RSVP con un POST directo. Y `apuntarse_evento_comunidad` devuelve 409 *"ya está completo"* a quien **ya está inscrita** si el aforo está lleno. | prod (RPC) + código | ⏳ |
| F-25 | Bloquear a una compañera es **irreversible y sin pantalla**: la API devuelve `bloqueadasPorMi` pero el portal solo monta 3 pestañas y no existe ruta de desbloqueo. Acción destructiva sin vuelta atrás. | código | ⏳ |
| F-26 | Un evento del tablón no se puede corregir: `dbUpdatePostComunidad` solo mapea `texto/likes/comentarios_count/fijado`. Fecha, aforo, lugar o audiencia mal puestos → borrar y republicar (con el fan-out otra vez). | código | ⏳ |
| F-27 | `postComunidadToDb` omite `tipo`, `evento_fecha`, `evento_aforo`, `evento_lugar`. Su consumidor `dbInsertPostComunidad` **no tiene llamadores**: código muerto, pero si se recablea, un EVENTO se guardaría como TEXTO en silencio. | código | ⏳ trampa latente |
| F-28 | `crear_reserva_atomica`: gemelo peligroso (sin `SECURITY DEFINER`, sin validaciones, usa `aforo_maximo` crudo, escribe `spot_id` en `LISTA_ESPERA`), **sin ningún caller y sin grant a anon**. Código muerto; conviene borrarlo. | prod + grep | ⏳ |
| F-29 | La **lista de espera con oferta está inerte en producción**: los 10 estudios tienen `lista_espera_plazo_aceptacion_minutos = 0`, así que nunca se crean ofertas. Todo el circuito (aceptar/expirar, dos endpoints gemelos, `hoja-oferta-espera.tsx`, barrido pg_cron cada 5 min) no se ejecuta jamás. | prod | 🔎 decisión de producto |
| F-30 | `bloqueoPorSuscripcion` se aplica en `charge-off-session`, `pos-bizum`, `terminal/cobrar` y `reembolsos`, pero **no** en `/api/stripe/checkout` ni `/api/public/checkout-embebido`. Un estudio con la suscripción a Tentare caducada sigue cobrando a sus socias por enlace público y widget. | código | ⏳ |
| F-31 | UPDATEs de dinero sin acotar por tenant (regla de la casa incumplida, no explotables hoy): `lib/billing/stripe-cobros.ts:172`, `app/api/reembolsos/route.ts:244`. | código | ⏳ |
| F-32 | Devolución de bono muda al cancelar clase/serie desde el panel: `lib/studio-context.tsx:2551` es `forEach(r => void devolverSesionBono(...))` fire-and-forget. El camino individual sí produce `avisoBono`. | código | ⏳ |
| F-33 | `reservas_spot_id_fkey` sin `ON DELETE`. No hay hoy código que borre `spots`, pero si se añade será el mismo `23503` que ya apareció con tarifas y planes. | prod | ⏳ |
| F-34 | Deriva repo↔BD: prod tiene 4 migraciones que **no están en el repo** (`20260827115244_integraciones_whatsapp_embedded_signup`, `20260826210318`, `20260826210532`, `20260828181142`) y `schema_migrations` no lista 2 que sí se aplicaron. `schema_migrations` sigue sin ser fuente fiable. | prod | ⏳ |

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Buena, pero sin mecanismo que impida reproducir patrones ya prohibidos (§0) | Medio | **Alta** |
| Frontend | Correcto salvo la familia §1 reintroducida en Comunidad | Bajo (tras F-2) | Media |
| Backend | Sólido; el problema son los **gemelos divergentes** (F-1, F-4, F-5, F-10, F-16) | Medio | **Alta** |
| Base de datos | Alineada con el repo salvo 4 migraciones huérfanas (F-34) | Bajo | Media |
| RLS | Aislamiento de filas correcto; falla la **comprobación de rol** (F-9, F-18) | Medio | **Alta** |
| Auth | Sin hallazgos. `current_studio_id()` → `null` para socias, verificado | Bajo | Baja |
| Pagos | 🔴 cerrado; quedan la red de recuperación (F-12, F-13) y POS (F-3) | **Alto** | **Máxima** |
| Reservas | Concurrencia correcta (`FOR UPDATE` + índices únicos). Spots tenía dos bugs, cerrados | Bajo | Media |
| Calendario | Sin hallazgos nuevos | Bajo | Baja |
| Automatizaciones | Crons activos y verificados; lista de espera inerte por configuración (F-29) | Bajo | Media |
| UX | "Funcionalidad a medias" es el tema dominante (F-14, F-15, F-25, F-26) | Medio | **Alta** |
| Rendimiento | No auditado en profundidad esta pasada | 🔎 | — |
| Seguridad | Un 🔴 real cerrado; sin secretos en cliente (verificado por barrido) | Medio→Bajo | Alta |
| Tests | 3.374 pasan. **Pero los fakes no evalúan predicados** (F-3): verde ≠ correcto | Medio | **Alta** |
| Infraestructura | Despliegue ya no atasca (los fixes viejos están en main) | Bajo | Baja |

---

# PLAN DE LIMPIEZA

**FASE 1 — CRÍTICOS (ya hecho, pendiente de desplegar)**
F-1, F-2 + aplicar la migración F-8/F-9.

**FASE 2 — ESTABILIZACIÓN (la red del dinero)**
F-12 y F-13 son el mismo problema: **desde que el webhook responde 200 antes de
procesar, el conciliador es la única red y está incompleto.** Antes del cobro
real del 21-sep.

**FASE 3 — FUNCIONALIDAD A MEDIAS**
F-14 (URL firmada para staff), F-15 (badge de mostrador), F-3 (cablear el
PaymentIntent al descongelar POS), F-25/F-26.

**FASE 4 — RLS por rol**
F-18, F-21, F-22, F-23, F-24. Todo el bloque comparte causa: policies escritas
con el predicado de tenant y sin el de rol.

**FASE 5 — Limpieza**
F-17 (ruido de Sentry), F-27, F-28 (código muerto), F-34 (deriva de migraciones).

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Solución | Verificación | Estado |
|---|---|---|---|---|---|
| F-1 | Webhook `setup` sin comprobar tenant | `app/api/stripe/webhook/route.ts` | Comprobación subida por encima de las 3 ramas + SEPA acotado por `studio_id` | typecheck + lint + 3.374 tests + relectura estructural | ✅ |
| F-2 | Borrar/publicar post optimista sin revertir | `lib/stores/use-content-store.ts`, `lib/supabase-data.ts` | Devuelven `boolean`; la store revierte y repone en su posición | typecheck + lint + tests | ✅ |
| F-3 | `stripe_payment_intent_id` nunca escrito | `lib/types.ts`, `lib/supabase-data.ts`, `lib/billing/procesar-reembolso.ts` | Campo en tipo y en ambos mappers + comentario falso corregido | **test de regresión nuevo** (6/6) + SQL en prod | ⚠️ parcial |
| F-4 | Doble suscripción CADENA | `app/api/billing/checkout/route.ts` | Guard `suscripcionActiva()` dentro de la rama CADENA | typecheck + lint + tests | ✅ |
| F-5 | `setup-sepa` sin guarda de modo | `app/api/stripe/setup-sepa/route.ts` | `comprobarModoStripe()`, igual que su gemelo | typecheck + lint | ✅ |
| F-6 | Segundo reembolso parcial perdido | `lib/billing/procesar-reembolso.ts` | Guard por acumulado monótono en vez de `devuelta_en IS NULL` | **test de regresión nuevo** | ✅ |
| F-7 | Asignar spot mudo + rompe cancelaciones | `lib/studio-context.tsx`, `app/(dashboard)/calendario/page.tsx` | Solo `CONFIRMADA`/`ASISTIDA` + error por toast | typecheck + lint + índice verificado en prod | ✅ |
| F-8/F-9 | anon en novedades + escritura de valoraciones | `supabase/migrations/20260901120000_…sql` | Drop policy + revoke; `admin_valoraciones` → SELECT | **ROLLBACK con control positivo en prod** | ⚠️ sin aplicar |
| F-10 | Cancelar clase `{ok:true}` con reservas vivas | `app/api/sustituciones/route.ts`, `lib/api-client.ts`, `app/(dashboard)/sustituciones/page.tsx` | Sentry + `aviso` propagado hasta la UI | typecheck + lint | ✅ |
| F-11 | Feedback de ayuda con `catch {}` vacío | `components/ayuda/AyudaFeedback.tsx`, `app/api/ayuda/feedback/route.ts` | Reporte a Sentry + 503 en vez de `ok:true` | typecheck + lint | ✅ |

## PROBLEMAS PARCIALMENTE SOLUCIONADOS

| ID | Qué se arregló | Qué queda | Motivo |
|---|---|---|---|
| F-3 | La fontanería (tipo + mappers + tests) | Que los cobros POS informen el campo, y que el conciliador cubra POS | El POS está congelado; cablearlo es producto sobre función apagada |
| F-8/F-9 | Migración escrita y **verificada con rollback en prod** | Aplicarla | Aplicar DDL sin supervisión en tarea programada es peor riesgo que un desajuste hoy inerte |

## PROBLEMAS PENDIENTES

| ID | Problema | Sev | Por qué no se arregló | Próximo paso |
|---|---|---|---|---|
| F-12 | 5xx que nadie recibe en ~20 caminos | 🟠 | Decisión arquitectónica sobre la red del dinero | Elegir: Sentry en los 20, o rediseñar la señal al conciliador |
| F-13 | Conciliador no sella factura | 🟠 | Implicaciones fiscales (Fiskaly) | Decidir si el conciliador debe sellar |
| F-14 | Documentos no reabribles por el estudio | 🟠 | Falta ruta nueva; quién puede reabrir es producto | Ruta de URL firmada para staff |
| F-15 | Badge de mostrador nunca se enciende | 🟠 | Dos diseños válidos, elegir mal deja el badge roto al revés | Decidir: fila STAFF vs resolver por rol |
| F-16 | Spot no conseguido, 2 de 4 superficies callan | 🟠 | Pide helper compartido = refactor | Extraer el mensaje de `portal-clases-view` |
| F-17…F-34 | Ver tabla 🟡 | 🟡 | Menores o decisión de producto | Fases 4 y 5 |

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 **2** · 🟠 **14** · 🟡 **18** — total **34**

- **Solucionados:** 8 (F-1, F-2, F-4, F-5, F-6, F-7, F-10, F-11)
- **Parcialmente solucionados:** 2 (F-3, F-8/F-9 — migración lista y verificada, sin aplicar)
- **Pendientes:** 24
- **No verificados:** 2 (F-20 y F-29 son decisiones de producto, no defectos demostrados)
- **Archivos modificados:** 16 (15 modificados + 1 migración nueva)
- **Tests ejecutados:** 3.374 · **Tests nuevos:** 2 · **Tests fallidos:** 0

| Check | Resultado |
|---|---|
| **Tests** | ✅ **PASS** — 3.374/3.374 |
| **Typecheck** | ✅ **PASS** en todo lo mío. 2 errores preexistentes de entorno: `Cannot find module 'react-leaflet'/'leaflet'`, porque el `node_modules` disponible es anterior a que se añadieran al `package.json`. No toqué ese archivo. |
| **Lint** | ✅ **PASS** en los 15 ficheros modificados. El lint del repo entero **no se pudo completar** (excede el timeout del entorno). |
| **Build** | ❌ **NO VERIFICADO** — el sandbox es linux/arm64 y el `node_modules` trae el binario SWC de macOS, sin red para descargar el correcto. **No es un fallo del código y no puedo afirmar que el build pase.** |
| **E2E** | ❌ **NO VERIFICADO** — Playwright necesita navegador y servidor levantado. |

## ESTADO REAL POST-AUDITORÍA

**Cómo estaba al empezar.** Mejor de lo que ha estado en semanas en lo
estructural: crons activos, BD alineada, concurrencia de reservas correcta con
`FOR UPDATE` e índices únicos reales, ni un secreto en el bundle cliente,
Sentry sin un solo error de dinero. Pero con un 🔴 explotable en el webhook de
Stripe que llevaba abierto desde que existen las ramas de `setup`.

**Los riesgos mayores eran** el webhook (F-1) y la reaparición íntegra de la
familia §1 en Comunidad (F-2) — el patrón que se dio por cerrado el 31-ago se
había vuelto a escribir en el código nuevo, palabra por palabra.

**Qué sigue abierto.** El riesgo de negocio no ha cambiado y **no es código**:
el cobro real de Stripe del 21-sep a un estudio suspendido. F-12 y F-13 son su
cara técnica: desde que el webhook responde 200 antes de procesar, el
conciliador es la única red y está incompleto (no sella facturas, no cubre POS).

**Nivel de confianza.** Alto en lo que he tocado: cada fix está verificado con
typecheck, lint y 3.374 tests, y la migración con un control positivo y rollback
en producción. Medio en el conjunto: **el build no se ha podido ejecutar**, así
que no puedo afirmar que compile, aunque el typecheck limpio lo hace muy
probable.

**Lo que NO he podido verificar:** el build, los E2E, el rendimiento real (no
auditado esta pasada), y el comportamiento en vivo de las áreas nuevas
—Comunidad, Documentos, Mensajería— más allá del código y de consultas a la BD.
No he ejecutado ningún flujo de usuario real.

**Antes de ponerlo delante de cientos de estudios**, en este orden:

1. Desplegar los 8 fixes y **aplicar la migración F-8/F-9**.
2. Cerrar la red de recuperación del dinero (F-12 + F-13) **antes del 21-sep**.
3. Terminar lo que está a medias: F-14 y F-15 son funcionalidad publicada que no
   hace lo que aparenta.
4. Repasar el bloque RLS-por-rol completo (F-9, F-18, F-21…F-24) de una vez, no
   tabla a tabla.

---

## §4 — LA RECOMENDACIÓN QUE IMPORTA MÁS QUE CUALQUIER FIX

Tres de los cuatro hallazgos más graves de esta pasada son **el mismo error
estructural**, no tres bugs:

- **F-1**: se arregló la comprobación de tenant en la rama de pago; su gemela de `setup` quedó abierta.
- **F-4**: se arregló el doble cobro en BASE/ESTUDIO; su gemela CADENA quedó abierta.
- **F-8**: se eliminaron 9 policies `anon using (true)` el 20-ago; la tabla creada 6 días después nació con esa forma.

Y F-5, F-10 y F-16 son variantes del mismo molde. En las auditorías del 21, 22 y
23 de agosto ya identificaste esta clase ("arreglar un endpoint y no su gemelo").
**Sigue siendo la causa dominante, y ninguna auditoría la ha reducido**, porque
cada pasada arregla instancias y no el mecanismo.

Mi recomendación como responsable técnico: dejar de arreglar instancias y
**convertir cada invariante en algo que el código no pueda incumplir**:

1. **Un único punto de entrada por invariante.** La comprobación de tenant del
   webhook no debería poder saltarse por estructura de `if/else`: debe ejecutarse
   una vez, arriba, antes de repartir. Eso es lo que he hecho en F-1 — y es
   replicable: guard de suscripción, guard de modo Stripe, comprobación de
   propiedad.
2. **Tests que evalúen predicados, no solo llamadas.** F-3 vivió con su test en
   verde porque el `fakeAdmin` devuelve siempre una fila. Un fake que ignora
   `.eq()` no prueba nada de lo que importa. Es la causa técnica de que "3 de 9
   fixes estaban rotos con todo en verde" el 20-ago.
3. **Una plantilla de policy por defecto** con tenant **y** rol, y un test que
   recorra `pg_policies` y falle ante cualquier `FOR ALL` sin `current_rol()` o
   cualquier `to anon using (true)`. Eso habría impedido F-8, F-9 y F-18 sin
   depender de que nadie se acuerde.

Sin esto, la 21ª auditoría encontrará esta misma sección con otros nombres.

---

**Entregable:** `audit-01sep.patch` (16 ficheros) en la raíz del repo.
Aplicar con `git apply audit-01sep.patch` sobre `origin/main` (`f5d48c7d`).

**Nota de limpieza:** durante la auditoría quedó un symlink accidental en
`node_modules/node_modules` que el sandbox no me permitió borrar. Es inocuo
(`node_modules` está en `.gitignore`), pero conviene quitarlo:
`rm /Users/marcosrocarodriguez/dev/o/node_modules/node_modules`
