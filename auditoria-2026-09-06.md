# AUDITORÍA TENTARE — 24ª pasada (6 sep 2026)

**Base auditada:** `origin/main` @ `43f44242` (verificado; la última comprobación de datos se hizo con main ya en `9d0dacdd`).
**Parche:** `audit-06sep.patch` — 6 ficheros, 248 inserciones. **Verificado que aplica limpio sobre `origin/main`.**
**Checks:** 3.846 tests PASS · lint PASS · typecheck **parcial** (ver §Verificación).

---

## ESTADO REAL DE TENTARE

* **Estado general:** el producto está sano en los sitios donde se mide directamente contra producción. Cero sobreventa, cero reservas duplicadas, cero bonos negativos, cero `payment_intent` repetidos, cero dunning atascado, RLS con aislamiento correcto en las tablas nuevas. Lo que falla no es el motor: es el **cableado entre capas**.
* **Riesgo técnico:** medio. La clase de fallo dominante sigue viva y hoy volvió a producir dos ejemplares nuevos, ambos nacidos en los últimos 4 días.
* **Riesgo de seguridad:** bajo. Verificado contra prod: 30 tablas sin políticas están en deny-all real (`anon` y `authenticated` sin `SELECT`), y las tablas nuevas (`recuperaciones`, `post_likes`, `plazas_fijas`) filtran por `current_studio_id()` y, donde toca, por `auth.uid()`.
* **Riesgo de datos:** bajo. Único residuo: 7 reservas `CONFIRMADA` en clases canceladas, todas de julio/agosto y todas de cancelación manual.
* **Riesgo de negocio:** **el más alto de los cuatro**, y no por un bug: por una promesa escrita en un comentario que el producto no cumple (§B-1).
* **Deuda técnica:** concentrada en un punto concreto y nombrable — **no existe ningún contrato entre quien emite un código de rechazo y quien lo consume**.
* **Áreas más problemáticas:** la cadena RPC → TS → API → pantalla en la reserva de la alumna, y el ritmo de desarrollo (31 commits en 2 días) contra el que ninguna barrera automática protege esa cadena.

### El hallazgo de fondo

Las cinco últimas auditorías han ido cerrando ejemplares de la misma familia. Hoy queda claro por qué no se agota: **el `codigo` de rechazo viaja por cuatro saltos y ninguno de los cuatro está tipado contra el siguiente.**

```
RPC reservar_plaza          →  crearReservaPublica  →  /api/public/reserva  →  reserva-codigos.ts
(12 `raise exception`)         (escalera de ifs)       (serializa)             (switch)
```

La consecuencia práctica: **añadir un rechazo nuevo en una migración deja el resto de la cadena en silencio.** No hay error de compilación, no hay test rojo, y el síntoma solo aparece cuando una socia real se lo encuentra. Pasó exactamente así dos veces esta semana:

| Rechazo nuevo | Introducido | Llegó a la alumna como |
|---|---|---|
| `RESERVA_BLOQUEADA_IMPAGO` → `codigo: 'impago'` (#1664) | 5-sep | «algo no ha salido como esperábamos · inténtalo de nuevo» |
| `ESTUDIO_CERRADO` (#1665) | 5-sep | ídem — y en el camino de pago, **cobrado sin plaza y sin avisar a nadie** |

El fix del 4-sep (que dio la familia por cerrada) arregló los tres códigos que conocía **por nombre**. Por eso no protegió: un test que nombra ejemplares no cierra una familia.

---

# 🔴 CRÍTICOS

### [C-1] Seis rechazos de negocio de la reserva viajaban sin `codigo` — ✅ SOLUCIONADO

**Área:** reservas / app de la alumna
**Archivos:** `lib/db/supabase-data-admin.ts` (`crearReservaPublica`), `lib/student/reserva-codigos.ts`

**Evidencia:** Sentry `JAVASCRIPT-NEXTJS-26`, 4-sep-2026 19:37, socia real en Bilbao, iPhone/iOS 18.7, `url: /portal/tentare/reservar/ses-mtm6zwkn-4-7jopr`. El evento lleva `mensaje: "Esta clase ya ha empezado"` y **`codigo` ausente**. Verificado en `origin/main`: seis `return { error: … }` sin `codigo` (líneas 1901, 1907, 1908, 1910, 1934, 1939).

**Qué ocurre:** el servidor rechaza correctamente y con su frase, pero sin `codigo` el `switch` de `reserva-codigos.ts` cae en el `default` y `lib/student/reservar.ts:118` **recorta el mensaje a propósito** (para no enseñar texto crudo de Postgres). La alumna lee el copy genérico de avería —«algo no ha salido como esperábamos · inténtalo de nuevo»— con un botón de reintentar que no puede funcionar: una clase que ya empezó no va a dejar de haber empezado. Además, cada intento levanta un evento nivel `error` en Sentry por una regla de negocio.

**Por qué ocurre:** el fix del 4-sep solo tocó `sin-plan`, `bono-no-cubre` y `max-simultaneas`. Los seis rechazos **anteriores** de la misma función se quedaron fuera.

**Solución aplicada:** los seis llevan `codigo` (`no-autorizado`, `sesion-no-encontrada`, `clase-cancelada`, `clase-ya-empezada`, `fuera-ventana-minima`, `fuera-ventana-maxima`); los cuatro nuevos añadidos al tipo `CodigoReserva`, a `CODIGOS_DE_NEGOCIO` y al `switch`. Verificado que ninguno de los seis mensajes contiene detalle interno (los seis son literales escritos a mano).

---

### [C-2] `ESTUDIO_CERRADO`: la alumna paga, no obtiene plaza, y el mostrador no se entera — ✅ SOLUCIONADO

**Área:** reservas + dinero
**Archivos:** `lib/db/supabase-data-admin.ts` (`crearReservaPublica` y `crearReservaPagadaPublica`), `lib/student/reserva-codigos.ts`

**Evidencia:** `supabase/migrations/20260905153105_cierre_del_centro.sql:142` lanza `raise exception 'ESTUDIO_CERRADO'`. Cero apariciones de esa cadena en todo el TypeScript de `origin/main`. Es alcanzable: `lib/cierres/aplicar-cierre.ts:11-15` dice explícitamente que la guardia vive en la RPC «para una sesión creada **DESPUÉS** de declarar el cierre» — esas sesiones no están marcadas `cancelada`, así que ninguna comprobación previa de TS las para.

**Impacto, en dos niveles:**
1. Camino normal: caía en `codigo: 'error'` → copy genérico + ruido en Sentry (igual que C-1).
2. **Camino del dinero:** `crearReservaPagadaPublica` corre desde el webhook de Stripe **con el cobro ya hecho**. `ESTUDIO_CERRADO` caía en `motivo: 'error'`, y ese motivo **no dispara `emitirReservaPagadaSinPlaza`** (solo lo hacen `sesion-invalida` y `spot-ocupado`). Resultado: socia cobrada, sin plaza, y nadie en el estudio avisado.

**Solución aplicada:** rama propia en la escalera con `codigo: 'estudio-cerrado'`; en el camino de pago se trata como `motivo: 'sesion-invalida'`, que es la misma situación de negocio que «clase completa» — cobrado y sin poder entregar — y sí avisa al mostrador. Añadido de paso `NO_AUTORIZADO`, el otro `raise exception` que tampoco estaba traducido.

**Nota de método:** este hallazgo **no salió de mi pasada**, salió de la revisión independiente de mis propios fixes. Es el segundo 🔴 del día y lo encontró el revisor, no el auditor.

---

### [C-3] `codigo: 'impago'` emitido por el servidor y desconocido por el cliente — ✅ SOLUCIONADO

**Área:** reservas / cobros
**Archivos:** `lib/student/reserva-codigos.ts`

**Evidencia:** `lib/db/supabase-data-admin.ts:2069` (main) devuelve `codigo: 'impago'` con el mensaje «Tienes un pago pendiente con el estudio. Escríbeles y lo resolvéis.» — un mensaje redactado con cuidado para no juzgar a la socia ni detallarle la deuda en una pantalla pública. `grep impago lib/student/reserva-codigos.ts` en `origin/main`: **cero resultados**.

**Qué ocurre:** ese mensaje cuidado **nunca se pinta**. La socia bloqueada por impago lee el copy genérico de avería y no se entera de que tiene que hablar con su estudio. La feature (#1664, opt-in del estudio) está entregada a medias desde el día que se desplegó.

**Solución aplicada:** `'impago'` añadido al tipo, al set de negocio y al `switch`, con test de comportamiento propio.

---

# 🟠 IMPORTANTES

### [B-1] El bono ya no se renueva solo — y la alternativa que el propio código promete no existe — ⏳ PENDIENTE (decisión de producto)

**Evidencia:** el 5-sep, #1653 quitó la renovación automática del bono (correctamente: había un autocobro real en producción, `pi_3UB9Ya…`, 2-sep). El comentario que lo justifica dice:

> «renovar sigue siendo posible cuando alguien lo PIDE: el botón «Renovar en un toque» del portal (`app/api/public/renovar-plan`)»

**Ese botón no existe.** `grep -rn prepararRenovacionPlan` en `origin/main` devuelve **una sola línea: su propia definición** en `lib/api-client.ts:369`. Sin llamantes. Ya se señaló como código muerto el 3-sep y sigue igual.

**Consecuencia:** hoy, una socia que agota su bono recibe un aviso y **no tiene ninguna forma de renovarlo desde el portal**. La única vía es que el estudio lo cobre a mano desde `/cobros`. El fix de dinero fue correcto; la salida que lo acompañaba es ficción.

**Por qué no lo he tocado:** conectar el botón es construir producto (dónde va, qué copy, qué pasa con `PUNTUAL`, qué ocurre si abandona el checkout), no arreglar un bug. **Es la decisión más urgente de esta lista.**

---

### [B-2] El panel se monta sin sesión y consulta la BD como `anon` — ✅ SOLUCIONADO

**Evidencia:** Sentry `JAVASCRIPT-NEXTJS-27`, 4-sep 02:20, `transaction: /login` pero `url: /dashboard`. `[dbStatsClientas] 42501 permission denied for table socios`, rol efectivo `anon`.

**Causa raíz:** `components/layout/dashboard-shell.tsx:105` — `const cargandoDatos = !!session && (…)`. Con `session === null` la expresión vale `false`, así que el shell **renderiza `children`**. El único guard es un `useEffect` con `router.replace('/login')`, que es navegación *soft* y tarda: los efectos de las páginas ya han corrido. Tres gemelos con el mismo agujero: `/dashboard`, `/clientas`, `/informes`.

**Lo que veía la usuaria:** no es ruido silencioso. `reportDbError` dispara un toast con «**No tienes permiso para hacer este cambio. Vuelve a entrar e inténtalo otra vez**» — un mensaje de *escritura* por una *lectura* que ella no pidió, justo mientras rebota al login.

**Solución aplicada:** `if (!session) return <skeleton>` justo después del bloque `if (loading)`. Colocado ahí y no dentro de `cargandoDatos` para cubrir también las dos ramas que devuelven `children` sin mirarla (editor de apariencia y `PantallaBienvenida`). Verificado por la revisión independiente: no hay ninguna ruta pública bajo `(dashboard)`, el editor también exige sesión, y `session` no puede ser `null` transitoriamente tras `loading=false` (`lib/auth-context.tsx:76-89`: solo `SIGNED_OUT` entrega `null`).

---

### [D-1] Cancelar una plaza fija desde el mostrador no crea la recuperación; desde el portal sí — ⏳ PENDIENTE

`lib/db/supabase-data-admin.ts:2819-2836` llama a `crear_recuperacion` cuando la socia cancela su plaza fija. `app/api/reservas/cancelar/route.ts:57-59` entra por `ejecutarCancelacionReserva` directo y se salta ese bloque. La plaza fija no consume bono (correcto en ambos), así que la socia **pierde la clase** si la cancela recepción por teléfono y la recupera si la cancela ella misma.

**Por qué no lo he tocado:** **0 plazas fijas y 0 reservas `res-pf-` en producción.** Cero urgencia, y «¿debe recepción generar recuperación en nombre de la socia?» es una decisión de producto. Recomendación: sí, y la forma limpia es que la ruta de staff entre por el mismo camino que la del portal.

---

### [D-2] La recompensa «Semana completa» solo se otorga marcando asistencia a mano — ⏳ PENDIENTE

`lib/studio-context.tsx:3361-3364` calcula la racha y otorga `SEMANA_COMPLETA`. `checkinPublico` (`supabase-data-admin.ts:4049-4097`) otorga `ASISTENCIA_CLASE` y `REFERIDO_AMIGO`, nunca `SEMANA_COMPLETA` — y por ahí pasan **los dos** caminos de servidor (kiosko y escáner de pase del mostrador). Un estudio que marca asistencia con QR anuncia una recompensa de 30 créditos canjeables que no llega nunca.

**Por qué no lo he tocado:** portar el cálculo de racha al servidor exige decidir la ventana y garantizar que no se otorga dos veces si conviven ambos caminos. No es una línea.

---

### [D-3] `/api/public/renovar-plan` fabrica una deuda que el cron acaba cobrando off-session — ⏳ PENDIENTE

El recibo que crea (`route.ts:70-75`) encaja **exactamente** con el filtro del adoptador de `lib/inngest/renovaciones.ts:84-107` (`PENDIENTE` + `proximo_reintento IS NULL` + `suscripcion_id` + `concepto LIKE 'Renovación%'`), que le programa el reintento y el dunning de las 08:30 lo cobra con la tarjeta guardada. Es decir: **pulsar «Renovar», cerrar el checkout, y que te cobren al día siguiente.**

**Severidad real hoy: baja**, porque el endpoint no tiene llamante (ver B-1). Pero es una trampa armada esperando a que alguien conecte el botón — que es justo lo que B-1 pide hacer. **Arreglar D-3 antes de B-2, no después.**

**Por qué no lo he tocado:** el arreglo obvio (acotar el adoptador a `MENSUAL`) **es incorrecto** — lo comprobé: dejaría huérfanos los recibos de bono agotado que genera `lib/studio-context.tsx:2960` sin `proximo_reintento`. La solución correcta pasa por distinguir el origen del recibo, y `recibos.es_renovacion` (nueva, 6-sep) no sirve porque los tres caminos la ponen a `true`.

---

### [D-4] El webhook de billing pisa `subscription_id` sin comparar — ⏳ PENDIENTE (heredado del 4-sep)

`app/api/billing/webhook/route.ts:155-160`, aplicado en las líneas 173, 195, 226 y 231 sin ninguna lectura previa. Stripe no garantiza el orden de entrega: un `customer.subscription.updated` tardío de una suscripción vieja puede pisar los datos de la nueva. La idempotencia del checkout **sí** se cerró (`app/api/billing/checkout/route.ts:191, 251`); esta mitad sigue abierta porque «qué hacer con la vieja» es decisión de producto.

---

### [D-5] `/api/emails/send` sigue sin comprobar rol — ⏳ PENDIENTE

Ya no es un relay abierto (el destinatario se valida contra `socios` del tenant y hay rate limit de 500/h). Pero no hay ni un `sesion.rol !==` en el fichero: un INSTRUCTOR puede mandar contenido libre (`tipo: 'automatizacion'`, asunto y cuerpo del body) a cualquier socia del estudio, y el límite es por estudio, no por usuario.

---

# 🟡 MEJORAS

* **[M-1] Ruido de terceros en Sentry** — ✅ SOLUCIONADO. `JAVASCRIPT-NEXTJS-25` («Error: La», `/precios`) **no es código nuestro**: los 4 frames del stack están en el bundle de Google Translate (`translate_http/…/el_main`), la URL real es `www-tentare-app.translate.goog`, y «La» es un trozo de una frase nuestra que su tokenizador partió. Añadido `denyUrls: [/translate_http/, /translate\.googleapis\.com/]`. **Deliberadamente NO se filtra `/translate\.goog/`**: bajo el proxy nuestros propios chunks se sirven desde ese host, y `denyUrls` mira el filename del último frame — ese patrón se tragaría también los errores reales de quien nos lea traducidos. (Ese fue mi primer intento; lo cazó la revisión independiente.)
* **[M-2] 7 reservas `CONFIRMADA` en clases canceladas** — todas de julio/agosto, todas cancelación manual (`cancelada_motivo IS NULL`). Sin víctimas vivas, pero cuentan como asistencia en los informes.
* **[M-3] Los cuatro `case` nuevos del `switch`** de `reserva-codigos.ts` son inertes (el `default` hace lo mismo). Son redundancia documental deliberada, no protección — conviene no confundirlas.

---

# REFUTADO (evidencia insuficiente o falso positivo)

* **`[verifactu] cadena de facturación bifurcada` (NEXTJS-28)** — **no hay rotura nueva**. Consultado el encadenamiento real de `facturas` en producción: la **única** discrepancia `verifactu_prev_hash` ↔ hash real es `studio-1` seq 4 (`A-2026-0028`), que es exactamente la exención `'studio-1:4'` ya presente en `lib/inngest/conciliar-cobros.ts:291`. El evento del 5-sep es anterior al despliegue de esa exención.
* **`recibos.es_renovacion` como columna muerta** — lo di por muerto y **estaba mal**: grepeé un árbol 31 commits atrasado. En `main` la usan `lib/billing/renovacion-server.ts:78,118`, los dos creadores de recibos y `lib/db-types.ts`.
* **`/api/public/renovar-plan` sin filtro de `PUNTUAL` como bug vivo** — el endpoint no tiene llamante; es una trampa latente (D-3), no un fallo en producción.
* **Aislamiento entre estudios** — comprobado contra prod, no inferido: 30 tablas sin políticas están en deny-all real; `recuperaciones`, `post_likes` y `plazas_fijas` (todas nuevas) filtran por `current_studio_id()`, y `post_likes` además por `auth.uid()`.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | **Sin contrato entre el emisor y el consumidor del `codigo` de rechazo** — raíz de los 3 🔴 de hoy | Alto | **1** |
| Frontend | Sano; el agujero de `dashboard-shell` cerrado hoy | Bajo | 4 |
| Backend | 12 `raise exception` de la RPC, 12 traducidos tras el fix (eran 10) | Bajo | 4 |
| Base de datos | 22 migraciones en 2 días, todas aplicadas; sin deriva | Bajo | 5 |
| RLS | Verificado contra prod con las tablas nuevas incluidas | Bajo | 5 |
| Auth | Sin hallazgos nuevos | Bajo | 5 |
| Pagos | Disputas, códigos de descuento e idempotencia del checkout **cerrados** desde el 4-sep; D-3 y D-4 abiertos | Medio | **2** |
| Reservas | 0 sobreventa, 0 duplicadas, 0 bonos negativos en prod | Bajo | 4 |
| Calendario | 7 reservas huérfanas históricas | Bajo | 5 |
| Automatizaciones | No re-auditado hoy | — | — |
| UX | **La socia no puede renovar su bono (B-1)** | Alto | **1** |
| Rendimiento | No auditado hoy | — | — |
| Seguridad | D-5 (rol en `/api/emails/send`) | Medio | 3 |
| Tests | 3.846 verde; los estructurales tenían falso verde en ternarios, corregido | Medio | 3 |
| Infraestructura | `tsc` no completa en este entorno; el árbol local llevaba 31 commits de retraso | Medio | 3 |

---

# PLAN DE LIMPIEZA

**FASE 1 — ahora**
1. Mergear `audit-06sep.patch` (los 3 🔴).
2. **B-1**: decidir cómo renueva su bono la socia. Es el hueco de producto abierto más caro.
3. **D-3 antes que conectar B-1**: si se conecta el botón sin arreglar el adoptador, se reintroduce un autocobro no pedido — el mismo que se acaba de quitar.

**FASE 2 — estabilización**
4. D-4 (`subscription_id`), D-5 (rol en `/api/emails/send`).

**FASE 3 — la familia, de verdad**
5. Tipar el contrato: que `crearReservaPublica` declare su retorno de rechazo como `{ error: string; codigo: CodigoReserva }`. Es cambio **solo de tipos**, sin runtime, y habría convertido `impago` y `ESTUDIO_CERRADO` en errores de compilación en vez de en dos socias con la pantalla equivocada.
6. D-1 (recuperación desde mostrador), D-2 (`SEMANA_COMPLETA` en el check-in de servidor).

**FASE 4 — calidad**
7. Que `tsc` complete en CI con presupuesto de memoria explícito. Hoy no es verificable en un entorno modesto, y hay commits locales que **desactivan el typecheck en dev** — la combinación deja el tipado sin red.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Solución | Verificación | Estado |
|---|---|---|---|---|---|
| C-1 | 6 rechazos sin `codigo` | `supabase-data-admin.ts`, `reserva-codigos.ts` | `codigo` en los 6 + 4 códigos nuevos en tipo/set/switch | 3.846 tests, mutación revertida → test rojo | ✅ |
| C-2 | `ESTUDIO_CERRADO` sin traducir (y sin avisar en el camino de pago) | `supabase-data-admin.ts`, `reserva-codigos.ts` | Rama propia + `motivo:'sesion-invalida'` en el pagado | test `salto 0` caza la reversión | ✅ |
| C-3 | `impago` desconocido por el cliente | `reserva-codigos.ts` | Añadido a tipo/set/switch | test de comportamiento propio | ✅ |
| B-2 | Panel montado sin sesión → queries como `anon` | `dashboard-shell.tsx` | `if (!session) return <skeleton>` | lint PASS + revisión independiente de 3 vectores | ✅ |
| M-1 | Ruido de Google Translate | `sentry-cliente.ts` | `denyUrls` acotado a `translate_http` y `translate.googleapis.com` | `denyUrls` confirmado en los tipos de `@sentry/core` | ✅ |
| T-1 | Mis tests daban falso verde en `return` ternarios | `cadena-rechazo-reserva.test.ts` | Regex sobre el objeto, no sobre el `return`; + test `salto 0` BD→TS | 3 mutaciones probadas, las 3 cazadas | ✅ |

## Defectos en MI PROPIO trabajo, encontrados por la revisión independiente

Tres de seis cambios estaban mal cuando todos los checks estaban en verde. Es el mismo porcentaje que el 20-ago y el 4-sep; el paso de revisión no es ceremonia.

1. **Incompleto:** cerré 6 rechazos y no miré la lista de `raise exception` de la RPC → me dejé `ESTUDIO_CERRADO`, que es un 🔴 con dinero de por medio (ahora C-2).
2. **Filtraba de más:** mi `denyUrls: [/translate\.goog/]` habría descartado en silencio los errores reales de la app de cualquiera que nos lea traducidos, porque nuestros chunks se sirven desde ese mismo host.
3. **Falso verde:** mi test «ningún rechazo se queda sin `codigo`» exigía el prefijo literal `return { error:` y por tanto **no veía** `sin-plan` ni `bono-no-cubre` — precisamente los del fix del 4-sep que decía proteger.

## PROBLEMAS PENDIENTES

| ID | Problema | Sev. | Por qué no se arregló | Próximo paso |
|---|---|---|---|---|
| B-1 | La socia no puede renovar su bono | 🟠 | Es construir producto, no arreglar un bug | Decidir dónde va el botón y qué hace con `PUNTUAL` |
| D-3 | El adoptador cobra off-session lo que la socia no completó | 🟠 | El arreglo obvio (acotar a `MENSUAL`) es incorrecto: dejaría huérfanos los bonos | Distinguir el origen del recibo |
| D-1 | Recuperación solo desde el portal | 🟠 | 0 filas en prod + decisión de producto | Unificar por la ruta del portal |
| D-2 | `SEMANA_COMPLETA` no se otorga por QR | 🟠 | Exige portar el cálculo de racha sin doble otorgamiento | Moverlo a `checkinPublico` |
| D-4 | Webhook pisa `subscription_id` | 🟠 | Qué hacer con la vieja es decisión de producto | Comparar antes de escribir |
| D-5 | `/api/emails/send` sin rol | 🟠 | Qué roles pueden escribir a socias es decisión de producto | Añadir gate de rol |
| M-2 | 7 reservas en clases canceladas | 🟡 | Limpieza de datos históricos | Script puntual |

---

# RESUMEN FINAL

**Problemas encontrados:** 🔴 3 · 🟠 7 · 🟡 3
**Solucionados:** 6 (los 3 🔴, B-2, M-1, T-1)
**Parcialmente solucionados:** 0
**Pendientes:** 7
**Refutados / falsos positivos:** 4
**Archivos modificados:** 6 (248 inserciones, 7 borrados)
**Tests ejecutados:** 3.846 · **fallidos:** 0 · **nuevos:** 3 (+2 reescritos)

* **Build:** NO VERIFICADO — `next build` no cabe en este entorno.
* **Typecheck:** **PARCIAL.** El grafo cliente (`reserva-codigos`, `reservar`, `sentry-cliente` y sus tests) PASA con `tsc -p` acotado. El proyecto completo **NO VERIFICADO**: `tsc --noEmit` supera los 175 s de la caja y el proceso se reaperece entre llamadas; también falló acotándolo a `supabase-data-admin.ts`, cuyo grafo de dependencias es enorme.
* **Lint:** PASS en los 6 ficheros tocados.
* **E2E:** NO EJECUTADO.

### Estado real post-auditoría, sin adornos

Tentare está mejor construido de lo que sugiere que cada auditoría encuentre 🔴 nuevos. El motor —aforo, bonos, aislamiento entre estudios, idempotencia de cobro— aguanta la comprobación **directa contra producción**, y eso es lo que de verdad se puede afirmar. Lo que falla, una y otra vez, es la última pulgada: que lo que el servidor decidió correctamente llegue entero a la pantalla de la alumna.

Los tres 🔴 de hoy son el mismo fallo tres veces, y dos de ellos nacieron **en los últimos cuatro días**, en features por lo demás bien hechas. El ritmo (31 commits en dos días) no es el problema; el problema es que no hay ninguna barrera automática entre una migración que añade un `raise exception` y la pantalla que tiene que saber contarlo. El test `salto 0` que dejo puesto cierra ese hueco concreto para `reservar_plaza`. La solución de fondo es tipar el contrato (Fase 3, punto 5): es un cambio solo de tipos y habría convertido los tres 🔴 de hoy en tres errores de compilación.

**Lo que no he podido verificar y hay que mirar:** el typecheck completo (y me preocupa más de lo normal, porque hay commits locales sin subir que **desactivan el typecheck en dev**: si esa red también se cae en CI, el tipado deja de proteger nada); el build; los E2E; y todo lo que no toqué hoy —automatizaciones, rendimiento, notificaciones—.

**Antes de ponerlo delante de cientos de estudios**, por orden: (1) resolver B-1, porque hoy hay socias que literalmente no pueden pagarle a su estudio; (2) arreglar D-3 antes de conectar B-1, o se reintroduce el autocobro que se acaba de quitar; (3) tipar el contrato de los códigos de rechazo, que es lo único que corta la familia de fallos que lleva seis auditorías reapareciendo.

Y un aviso de método que ya va por la tercera vez: **el árbol local estaba 31 commits por detrás de `origin/main` y 8 por delante.** Auditar ahí es auditar código que no existe en producción. Esta auditoría se rehízo entera sobre un worktree limpio de `origin/main` en cuanto se detectó.
