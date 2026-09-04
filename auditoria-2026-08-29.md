# Auditoría extrema de Tentare — 29 de agosto de 2026

**Base auditada:** `origin/main` en `e82367c3` (29-ago 00:39). Main **no avanzó** durante la pasada (0 commits nuevos al terminar).
**Delta desde la última pasada:** 62 commits, 681 ficheros, +21.438 / −26.521.
**Entregable:** rama `audit/2026-08-29` (commit `7dc33a97`) en tu repo local + `audit-29ago.patch`.

---

## ESTADO REAL DE TENTARE

**Estado general.** El atasco de despliegue **sigue roto** (buena noticia): los 12 fixes del 26-ago están en `main` vía el PR #1429, y la rama `audit/2026-08-26` ya no hace falta. Es la segunda pasada seguida en que el código auditado ES el código en producción.

**Lo que define esta pasada:** *funcionalidad nueva que nunca llegó a funcionar y nadie se enteró*. Community & Messaging OS (#1426) desplegó el 26-ago la pieza de "compañeras de clase" con un `INSERT` sin `id` sobre una tabla cuyo PK es `text` sin default. **Todas** las solicitudes mueren con 23502 desde el primer día — 0 filas en producción, verificado. Pasó typecheck, lint y 3.343 tests. El mismo patrón, tres veces:

- **compañeras**: la pieza entera es inalcanzable (🔴, arreglado).
- **`instructores.bio`**: el formulario de Equipo la edita, la envía y dice «Cambios guardados» — y ninguna de las dos listas blancas la copia. La ficha de instructora del portal (#1453) no puede enseñar una bio **nunca** (🔴, arreglado).
- **`socios.visible_en_clase`**: la migración promete por escrito una ruta de escritura que no existe. "Quién más va a esta clase" no puede enseñar un solo nombre a nadie (🟠, pendiente — necesita decisión de UI).

**Riesgo técnico: medio.** La arquitectura aguanta: verifiqué las 41 rutas de `app/api/public/**` y **todas** derivan la identidad de la socia del JWT; `studioId` llega del cliente en casi todas pero siempre como *acotador* (`.eq()` junto a la identidad), nunca como autorizador. La única excepción es `/api/public/evento`.

**Riesgo de seguridad: bajo-medio.** No encontré ninguna fuga cross-tenant explotable hoy. Dos hallazgos que parecían fugas quedaron **refutados** con control positivo (ver §Refutados). Lo que sí hay: dos `.ilike('email', …)` sin escapar, uno alcanzable desde la API OAuth con el email sin validar de un integrador (arreglado).

**Riesgo de datos: ALTO en un punto concreto.** Dos condiciones de salud activas de tipo `EMBARAZO` son legibles hoy en producción por socias **sin consentimiento registrado** (art. 9 RGPD). No lo he tocado: cerrarlo cambia lo que ve el estudio.

**Riesgo de negocio: medio.** El camino del dinero está limpio en lo que está vivo (0 anomalías en las 8 consultas de conciliación sobre producción). Lo que está roto —el reembolso de venta POS (#1437)— pertenece a una pantalla **congelada** desde julio, así que no pierde dinero hoy, pero está escrito para no funcionar el día que se descongele.

**Deuda técnica: bajando.** Los borrados masivos (255 módulos huérfanos, el kit de temas, `studios.portal_react`, 220 shims) no rompieron **ni un import** en 1.983 ficheros — verificado con resolución real de rutas. Cero `as any`, cero `@ts-ignore`. CI exige lint + typecheck + tests + build + 12 shards de e2e en todo PR.

**Áreas más problemáticas:** ① la pieza social del portal (mitad muerta), ② datos de salud sin consentimiento, ③ el POS congelado con un fix inerte, ④ la UX de sesión caducada en el portal.

---

# 🔴 CRÍTICOS

### [C-1] `socio_companeras`: el INSERT no pone el `id` — la pieza entera lleva 3 días muerta ✅ SOLUCIONADO

**Área:** Community & Messaging OS · **Archivo:** `app/api/public/social/companeras/route.ts:81`
**Evidencia:** el insert enviaba `{studio_id, solicitante_id, destinataria_id, estado}` sin `id`; `20260826203011_socio_companeras_esquema_rls.sql:13` declara `id text primary key` **sin default**.
**Verificación en producción** (insert real dentro de transacción abortada): `23502 / null value in column "id"`. `select count(*) from socio_companeras` → **0 filas**.
**Qué ocurre:** el botón "Agregar" de la ficha de clase y toda la pantalla `/companeras` devuelven 500. Nunca puede existir una relación `aceptada`, así que aceptar y bloquear son inalcanzables también.
**Causa raíz:** el resto del repo genera el id en TS (`com-${uid()}`, `docsocio-${uid()}`, `msg-${crypto.randomUUID()}`); aquí se olvidó. `RowSocioCompaneras` no distingue "columna obligatoria sin default" de "la pone Postgres", así que tsc no lo ve.
**Solución aplicada:** `id: \`comp-${uid()}\`` + el import que faltaba (lo cazó el typecheck).
**Test nuevo:** `lib/insert-id-explicito.test.ts` — cruza las migraciones con el código y exige `id` explícito en toda tabla con `id text primary key` sin default. **Control positivo verificado**: al quitar el `id`, falla señalando el fichero y la línea.

### [C-2] La bio de instructora se "guarda" sin escribirse ✅ SOLUCIONADO

**Área:** Equipo / portal · **Archivos:** `lib/actions/equipo/equipoAction.ts:40-61,102-114`, `app/(dashboard)/equipo/page.tsx:339,596-606`
**Evidencia:** el formulario pinta *«Sobre mí (opcional)»* con contador `{form.bio.length}/400` y envía `bio` (línea 339). `saneaFieldsPropietario`, `saneaFieldsPropios` y `crearInstructora` **no copiaban `bio`**. Y `let mensaje = 'Cambios guardados'` sale siempre.
**Impacto:** `instructores.bio` es columna real y es exactamente lo que pinta la ficha de instructora del portal (`app/portal/[slug]/instructores/[instructorId]/page.tsx:148`). Una feature de #1453 que no podía funcionar.
**Solución aplicada:** helper `saneaBio` en las dos listas blancas y en el alta, con el mismo tope de 400 que muestra el contador (la validación de cliente no puede ser la única).
**Gemelos comprobados:** los otros tres `insert` sobre `instructores` (onboarding, formalización de Network, alta de freelance) no manejan bio por diseño — ahí no existe todavía.

### [C-3] Condiciones de salud legibles sin consentimiento ⏳ PENDIENTE

**Área:** RGPD / datos de salud · **Archivos:** `components/socios/ficha-salud.tsx:492,647`, `lib/supabase-data.ts:3427`, migración `20260804201830`
**Evidencia (producción, hoy):** `select cs.categoria, s.consentimiento_salud_fecha from condiciones_salud cs join socios s …` → **2 de 4 condiciones activas son `EMBARAZO` de socias con `consentimiento_salud_fecha = NULL`** (12-jul y 20-jul).
**Qué ocurre:** `tiene_consentimiento_salud()` solo aparece en el `with_check` del **INSERT**. Ninguna policy de SELECT ni ningún camino de lectura lo comprueba, y no se aplicó retroactivamente. El gate `if (!socio?.consentimientoSalud)` está en `abrirNueva()` y en el cuestionario, **nunca sobre el listado**; el semáforo (`rpc('semaforo_salud_estudio')`) las convierte además en ROJO/ÁMBAR visible para RECEPCIÓN.
**Impacto:** categoría especial del art. 9 RGPD tratada sin base legal registrada, y visible para un rol más amplio del que la registró.
**Por qué NO lo he arreglado:** añadir `tiene_consentimiento_salud(socio_id)` al `using` de las policies de SELECT y al `where` del semáforo **oculta datos que el estudio ve hoy**. Es un cambio de comportamiento de negocio con implicaciones legales: lo decides tú, no yo.
**Recomendación:** cerrar la lectura y, a la vez, un flujo de "pedir consentimiento" para las fichas ya existentes. Gemelo a cerrar en el mismo PR: `/api/socios/eliminar` (ver I-1).

### [C-4] `/api/public/evento` acepta `socioId` del body sin JWT ⏳ PENDIENTE (decisión de producto)

**Área:** Portal / analítica · **Archivo:** `app/api/public/evento/route.ts:44,61`
**Evidencia:** `socioId: body.socioId ?? null`, sin ningún `verificarUsuarioSupabase`. Tiene efecto real: `lib/db/supabase-data-admin.ts:1719-1725` dispara `emitirReservaAbandonada` para `booking_abandoned`.
**Qué ocurre:** los `socioId` son públicos (`fetchPublicStudioData` los expone). Cualquiera, sin sesión y a 120 req/min, dispara el email "has dejado la reserva a medias" a socias reales y envenena `widget_eventos.socio_id`, que es la base del funnel.
**Por qué NO lo he arreglado:** el comentario del propio fichero declara este riesgo como **residual aceptado y revisado** (`docs/cro-analytics-widget-diseno.md §5.2/§7.3`), acotado por el `dedupKey` diario. Exigir JWT reduciría los emails legítimos del widget anónimo. Es tu decisión, no un descuido.
**Recomendación:** aceptar `socioId` para atribución de analítica, pero **exigir JWT para disparar el email**. Cierra el abuso sin tocar el funnel.

---

# 🟠 IMPORTANTES

| ID | Problema | Estado |
|----|----------|--------|
| I-1 | "Dejarla pasar" una oferta de lista de espera dejaba la plaza huérfana | ✅ |
| I-2 | `aceptar_oferta_lista_espera` no miraba `sesiones.cancelada` | ✅ |
| I-3 | `reservar_plaza` no miraba `spots.activo` (su gemelo JS sí) | ✅ |
| I-4 | El CHECK de valoración **congelaba** la reserva | ✅ |
| I-5 | Cancelar la clase no avisaba a quien estaba en lista de espera | ✅ (push) / ⚠️ (email) |
| I-6 | Dos `.ilike('email', …)` sin `escaparLike` | ✅ |
| I-7 | `imagenUrl` de un post: `includes()` dejaba pasar un origen arbitrario | ✅ |
| I-8 | Notas internas de sesión en el payload público anónimo | ✅ |
| I-9 | El email editable en Ajustes/Perfil tiraba TODO el guardado | ✅ |
| I-10 | Preferencias de avisos: optimista sin revertir | ✅ |
| I-11 | El fix del reembolso POS (#1437) busca por una columna que nadie escribe | ⏳ |
| I-12 | Sesión caducada: el portal enseña "no tienes nada" | ⏳ |
| I-13 | `visible_en_clase`: opt-in sin ninguna vía de escritura | ⏳ |
| I-14 | Borrado RGPD incompleto | ⏳ |
| I-15 | Auto-bloqueo de la socia si el estudio corrige su email | ⏳ |
| I-16 | Un control de seguridad de mensajería vive SOLO en producción | ⏳ |

### [I-1] "Dejarla pasar" dejaba la plaza huérfana ✅ SOLUCIONADO

`components/portal/hoja-oferta-espera.tsx:21-24` afirmaba que rechazar la oferta «ya libera el hueco y promueve a la siguiente». **Era falso:** `cancelar_reserva_plaza` (definición viva en producción) solo promocionaba con `v_estado in ('CONFIRMADA','ASISTIDA')`. Su gemela `expirar_oferta_lista_espera` **sí** promociona.
**Consecuencia:** rechazar la oferta explícitamente era PEOR que ignorarla. La cola entera se quedaba sin enterarse y la clase se daba con un hueco.
**Solución:** rama `v_estado = 'LISTA_ESPERA' and v_tenia_oferta` en la RPC (migración `20260829120000`). Se exige que hubiera oferta viva a propósito: `promocionar_siguiente_espera` **no comprueba aforo**, así que llamarla al abandonar la cola sin más confirmaría una plaza inexistente.
**Comentarios corregidos** en los dos ficheros que afirmaban lo contrario.

### [I-2] Aceptar una oferta de una clase CANCELADA ✅ SOLUCIONADO

`aceptar_oferta_lista_espera` comprobaba caducidad, hora y aforo — pero no `sesiones.cancelada`, que su gemela sí comprueba desde `20260819120000`. Camino real: cancelar una clase marca `cancelada` y cancela las reservas en una llamada **aparte** que puede fallar; con la oferta viva, la socia la aceptaba, quedaba CONFIRMADA y se le gastaba una sesión del bono sobre una clase que no existe. Nueva salida `CLASE_CANCELADA` por el mismo camino que `AFORO_LLENO` (cancela + recuperación), con su texto propio en `emitirReservaCancelada` y en el mensaje a la socia.

### [I-3] `reservar_plaza` no miraba `spots.activo` ✅ SOLUCIONADO

`asignarSpotReserva` (JS) comprueba `!spot.activo`; la RPC del camino de **pago** no. Un reformer dado de baja se podía vender por "pagar y reservar sin login". Nuevo error `SPOT_NO_DISPONIBLE`, manejado en el único llamante que pasa `p_spot_id`. Hoy hay 0 spots inactivos en producción: era latente.

### [I-4] Valorar una clase CONGELABA la reserva ✅ SOLUCIONADO

`reservas_valoracion_experiencia_solo_asistida` (28-ago) es un CHECK **de fila**: una vez valorada, cualquier UPDATE posterior de `estado` fallaba con 23514.
**Verificado en producción** sobre una reserva real, en transacción revertida: `CANCELADA`, `NO_ASISTIO` y `CONFIRMADA` daban las tres 23514.
Rompía tres caminos del mostrador: marcar no-show, deshacer check-in y cancelar una ASISTIDA para cuadrar histórico. **Solución:** el CHECK pasa a trigger que valida **solo cuando la valoración se pone o cambia**. El CHECK de rango (1..5) se queda intacto. Hoy hay 0 filas valoradas: latente pero garantizado.

### [I-5] Cancelar la clase no avisaba a la lista de espera ⚠️ PARCIAL

`dbCancelarReservasPorSesiones` cancela `['CONFIRMADA','LISTA_ESPERA','PENDIENTE_APROBACION']`, pero la audiencia `socias-e-instructora-de-la-sesion` resolvía solo `CONFIRMADA` — y el email del panel (`notificarCancelacionSesiones`) filtra `CONFIRMADA/ASISTIDA`. A quien estaba en espera se le borraba la reserva **en silencio absoluto**.
**Aplicado:** audiencia nueva `socias-y-espera-e-instructora-de-la-sesion`, usada **solo** por `clase.cancelada` (a quien no tiene plaza no le cambia nada que se mueva la hora, así que `clase.modificada` se queda como estaba). El orden ya era el correcto: los dos llamantes avisan ANTES de cancelar las reservas.
**Queda pendiente:** el **email**. Requiere una variante de copy («la clase para la que estabas en lista de espera…»); no lo he hecho para no mandar un texto que miente.

### [I-6] `.ilike('email', …)` sin escapar ✅ SOLUCIONADO

`lib/db/supabase-data-admin.ts:3198` (`registrarSociaPublica`) y `:2922` (`resolverSociaAutenticada`). El primero es alcanzable desde `/api/oauth/v1/clientas` con `email` **sin validar** de un integrador con scope `clientas:escribir`: `email: "%"` adoptaba una ficha fantasma arbitraria del estudio y le reasignaba el bono ya cobrado. `lib/escapar-like.ts` existía y tenía 7 llamantes; estos dos no.
**Aplicado:** `escaparLike` en ambos + validación de formato en la ruta OAuth.
**Test nuevo:** `lib/escapar-like-en-toda-ilike.test.ts`, que mira **el argumento**, no el vecindario. La primera versión miraba las 6 líneas anteriores y su control positivo **pasaba en verde** por culpa de mi propio comentario: corregido y re-verificado.

### [I-7], [I-8], [I-9], [I-10] ✅ SOLUCIONADOS

- **I-7** `app/api/comunidad/posts/route.ts:54`: `includes('/comunidad-media/')` dejaba pasar `https://rastreo.ajeno.example/comunidad-media/x.png`, que acababa en un `<img src>` cargado por todas las socias del estudio (IP, User-Agent y hora de lectura a un tercero). Ahora `startsWith` del prefijo real de Storage.
- **I-8** `lib/db/supabase-data-admin.ts:741`: `notas` e `incidencia_texto` de `sesiones` viajaban en el payload de `POST /api/public/studio-data`, que responde **también sin sesión**. Es texto que escribe el personal para el personal. Confirmado en producción: 2 filas con texto de staff. Verificado que no lo lee **nadie** en portal, widget ni `/reservar`.
- **I-9** `portal-ajustes-view.tsx` y `portal-perfil-view.tsx` mandaban siempre `email`, y el servidor lo rechaza **antes de escribir nada**: tocar el email perdía en el mismo gesto nombre, apellidos, teléfono, usuario, fecha de nacimiento y dirección. Ahora no se envía y el campo es `readOnly`.
- **I-10** `guardarPreferencia` era `Promise<void>` y tiraba la respuesta; los dos interruptores (portal y panel) pintan optimista sin revertir. La socia creía haber apagado un aviso de pago y al recargar volvía encendido. Ahora devuelve `boolean` y ambos revierten.

### [I-11] El fix del reembolso POS (#1437) es inerte ⏳ PENDIENTE

`lib/billing/procesar-reembolso.ts:255` busca la venta por `stripe_payment_intent_id`, y **esa columna no se escribe en ningún sitio**: no está en `VentaPOS` (`lib/types.ts:1060`) ni en `ventaPOSToDb` (`lib/supabase-data.ts:1502`); el único sitio con el PI a mano lo mete en texto libre (`notas`). Producción: **19 de 19 filas con `stripe_payment_intent_id IS NULL`**. Todo `charge.refunded` de origen POS cae en `if (!venta)` y devuelve `{ok:true}` sin revertir nada.
Segundo escalón: `lib/studio-context.tsx:3806-3839` crea un recibo `rec-pos-*` **y una factura sellada** por cada venta (12 recibos en producción, los 12 `COBRADO`), y la devolución no los toca; no existe ninguna columna que enlace venta↔recibo.
**Por qué NO lo he arreglado:** `/pos` está **congelado** desde el 23-jul (`app/(dashboard)/pos/page.tsx` es un stub que redirige; la pantalla real es `page.frozen.tsx`). No hay UI que escriba ventas hoy, así que no se pierde dinero — pero el fix está escrito para no funcionar el día que se descongele. Añadir el enlace venta↔recibo es un cambio de modelo de datos: decisión tuya.

### [I-12] Sesión caducada: el portal enseña "no tienes nada" ⏳ PENDIENTE

`lib/auth-server.ts:115` devuelve `null` y `app/api/public/studio-data/route.ts:35` **no responde 401**: responde 200 con el catálogo anónimo. En `lib/studio-context.tsx:1049-1071`, sin guarda, `setSuscripciones(socia?.suscripciones ?? [])` y compañía **vacían el estado personal**. La socia sigue con su nombre en la nav y de golpe ve cero reservas, cero bonos, "no tienes plan" — riesgo real de recomprar un bono que ya tiene. Agravante: `errorPublico` no tiene ni un consumidor en `app/portal/**` ni en `components/portal/**` (solo en `/reservar`).
**Por qué NO lo he arreglado:** la mitad de corrección (no pisar el estado personal) es fácil, pero deja a la socia con datos correctos **y ningún aviso**, lo que puede ser peor. La otra mitad es una decisión de UX del `PortalShell`: dónde y cómo se dice "tu sesión ha caducado, vuelve a entrar". **Es el pendiente que más recomiendo cerrar.**

### [I-13] a [I-16] ⏳ PENDIENTES

- **I-13** `20260826202949_socios_visible_en_clase.sql:11` promete por escrito una API de escritura que **no existe**. Producción: 0 socias con `visible_en_clase`. Combinado con C-1, "Quién más va a esta clase" no puede enseñar un solo nombre: ambas ramas de `app/api/public/social/clase/[sesionId]/route.ts:101-111` son inalcanzables. **Fix:** añadir `visibleEnClase` a la lista blanca de `PATCH /api/public/socio` (que ya deriva `socioId` del JWT) + un interruptor en Ajustes.
- **I-14** `app/api/socios/eliminar/route.ts:47` borra 5 tablas y deja fuera `respuestas_cuestionario_salud` (dato de salud), `lecturas_ficha_salud` y `documentos_socio` (+ sus objetos en Storage). Hoy `respuestas_cuestionario_salud` tiene 0 filas: latente. Gemelo de C-3, cerrar en el mismo PR.
- **I-15** El panel puede escribir `socios.email` sin restricción (`lib/supabase-data.ts:1716`), pero `validarSociaPublica` autoriza comparando `socios.email` con el email del JWT: si el estudio corrige un email, **toda escritura de esa socia pasa a 401** aunque siga logueada. Producción: 6 socias vinculadas, 0 desalineadas hoy. **Fix:** autorizar por `auth_user_id` (que es lo que ya usa `socioAutenticado`), no por igualdad de email.
- **I-16** `supabase_migrations.schema_migrations` tiene `20260827103031 · conversacion_participantes_solo_leido_hasta` con un `revoke update` + `grant update (leido_hasta)` que **no existe en ningún ref del repo**. Lo que el repo sí tiene (`20260825175436_community_messaging_os_rls.sql:81`) es `grant select, update` de **tabla entera**: reconstruyendo desde el repo, una usuaria podría cambiar el `conversacion_id` de su propia fila de participante y meterse en una conversación ajena. **Producción está protegida** por el grant de columna manual; el repo no. Sin fichero no hay revisión, ni test, ni supervivencia a un restore.

---

# 🟡 MEJORAS (selección)

- **Tres policies `anon SELECT using(true)`** en `contenido_portal`, `contenido_portal_banners` y `novedades_estudio`. **No son una fuga** (ver Refutados) pero prometen un acceso que nadie tiene y que nadie usa: el portal lee por service-role y el panel por la policy `admin_*`. Conviene borrarlas o documentar por qué siguen.
- **`anon` conserva GRANT** sobre `public.reservas`, `public.socios` e `instructores`. Hoy inerte (ninguna policy para `anon` en esas tablas), pero es la misma pólvora del 14-ago: `revoke`.
- **Fecha local vs UTC**: `components/portal/portal-clases-view.tsx:69-70` construye la clave del día en local y `:283` compara contra la fecha **UTC** del ISO. Una clase entre 00:00 y 02:00 de Madrid cae en la pestaña del día anterior. `lib/portal-home-logic.ts:222` sí lo hace bien.
- **Email en query string**: `/api/public/estado-pago?pi=…&email=…`. La comprobación es correcta; el canal deja el email en logs de acceso y `Referer`.
- **`app/api/terminal/cobrar/route.ts:76`** es el único `paymentIntents.create` del repo sin `idempotencyKey`.
- **Código muerto real** tras los borrados: `components/portal/usar-datos-portal.ts` no lo importa nadie (el commit #1445 lo citó como consumidor vivo y ya no lo era), y con él caen `lib/portal-tema/datos.ts` y `tipos.ts`. Otros cinco módulos sin ningún importador externo (`importar-tema-zip.tsx`, `tarjeta-instructora.tsx`, `landing/network/data.ts`, `medicion-cuestionario-salud-fase2.ts`, `lib/iconos.ts`).
- **`npm test` solo mira `lib/`** (`"lib/**/*.test.ts"`), y `app/` y `components/` tienen **cero** ficheros de test. Ampliar el glob a `{lib,app,components}` antes de que alguien escriba el primer test fuera de `lib/` y no se entere de que no corre.
- **Tres comentarios citan migraciones con nombre inexistente** (`20260826200010`, `20260826210000`): la próxima pasada buscaría la defensa en el sitio equivocado.
- **`Europe/Madrid` cableada** en 44 migraciones y `studios` sin columna de zona horaria. Asunción de producto, no bug — pero es el techo si algún estudio sale de la península.
- **`promocionar_siguiente_espera` no comprueba aforo.** Con `lista_espera_plazo_aceptacion_minutos = 0` confirma directamente: sobreventa posible. Agujero **preexistente** (`expirar_oferta_lista_espera` ya lo tenía); I-1 lo hace alcanzable desde un segundo camino. Recomiendo cerrarlo en la RPC.

---

## REFUTADOS (verificados con control positivo — no volver a levantarlos)

1. **"`novedades_estudio` filtra el tablón de todos los estudios a `anon`"** — FALSO. La policy `using(true)` existe, pero `anon` **no tiene el privilegio de tabla**: `set local role anon; select … from contenido_portal` → `42501 permission denied`. Sin GRANT, la policy es letra muerta. (Es el recíproco del no-op del 14-ago: allí el GRANT hacía inútil el REVOKE de columna; aquí la falta de GRANT hace inútil la policy.)
2. **"La fuga de PII de `red_perfiles` del 14-ago"** — cerrada y verificada: `information_schema.column_privileges` para `authenticated` = SELECT sobre **3 de 30** columnas.
3. **"El fix de `entregar-plan-comprado` del 26-ago dejó un escalón"** — no lo dejó. `socios` tiene **cuatro** índices únicos, no dos, pero el INSERT no escribe `auth_user_id` ni `usuario`, así que los dos nuevos no pueden dar 23505. Sin escalón pendiente.
4. **"El conciliador de reembolsos sigue siendo un placebo"** — arreglado de verdad en #1431: llama a `procesarChargeRefunded`/`procesarDisputeClosed` compartidos, con `{stripeAccount}`, listando por `refunds.list`/`disputes.list`, y hace el `upsert` de auditoría **después** de aplicar.
5. **Realtime de mensajería** — no pude construir ninguna suscripción cruzada: `conversacion:{id}` exige `es_participante_conversacion()` y los ids no contienen `:`, así que `split_part(topic,':',2)` no se puede manipular.

---

## MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida donde la verifiqué (identidad del JWT en las 41 rutas públicas) | Bajo | — |
| Frontend | Bueno; el portal nuevo es denso pero coherente | Bajo | — |
| Backend | Bueno; el patrón "API route + service-role + comprobación a mano" se aplica de forma consistente | Bajo | — |
| Base de datos | Buena; pero 2 migraciones viven solo en producción | Medio | I-16 |
| RLS | Correcta; sin fugas cross-tenant encontradas | Bajo | 🟡 revokes |
| Auth | Correcta; la UX de caducidad es el hueco | Medio | I-12 |
| Pagos | Limpio en lo vivo (0 anomalías en prod); roto en lo congelado | Medio | I-11 |
| Reservas | 4 huecos cerrados esta pasada | Bajo tras el PR | — |
| Calendario | Sin hallazgos nuevos | Bajo | — |
| Comunidad / social | **Mitad muerta** | **Alto** | C-1 ✅, I-13 |
| Datos de salud | **Consentimiento no se comprueba en lectura** | **Alto** | C-3 |
| UX | Buena; los estados vacíos y de error del portal son el punto flojo | Medio | I-12 |
| Rendimiento | Sin hallazgos que justifiquen tocar nada | Bajo | — |
| Seguridad | Sin fuga explotable encontrada | Bajo-Medio | C-4 |
| Tests | 3.345 unitarios + 157 e2e; **0 tests fuera de `lib/`**; RLS sin cobertura | Medio | 🟡 glob |
| Infraestructura / CI | Sólida: lint + typecheck + tests + build + 12 shards e2e en todo PR | Bajo | — |

---

## PLAN DE LIMPIEZA

**FASE 1 — Críticos.** Mergear `audit/2026-08-29`. Decidir C-3 (lectura de salud sin consentimiento) y cerrarlo junto con I-14. Decidir C-4.
**FASE 2 — Estabilización.** I-12 (sesión caducada, el que más recomiendo), I-16 (recuperar del catálogo las 2 migraciones sin fichero), I-15, I-13.
**FASE 3 — Refactor.** I-11 solo cuando se descongele el POS: columna `recibo_id` en `ventas_pos`, escritura del `stripe_payment_intent_id`, y la rama POS en los tres manejadores de reembolso/disputa y en el cron.
**FASE 4 — Calidad.** Ampliar el glob de `npm test`; e2e del centro de ayuda (0 de 157 specs lo tocan); cerrar `promocionar_siguiente_espera` sin comprobación de aforo.
**FASE 5 — Mejoras.** Revokes de `anon`; borrar el código muerto identificado; el desfase UTC del portal; `idempotencyKey` en terminal/cobrar.

---

## REPARACIONES REALIZADAS

| ID | Archivo(s) | Verificación | Estado |
|----|-----------|--------------|--------|
| C-1 | `app/api/public/social/companeras/route.ts` | typecheck (cazó el import que faltaba) + test guardián con control positivo | ✅ |
| C-2 | `lib/actions/equipo/equipoAction.ts` | tsc + lint; columna y consumidor verificados | ✅ |
| I-1 | migración `20260829120000` | función compilada y ejecutada contra **producción** en `pg_temp` + rollback | ✅ |
| I-2 | migración + `supabase-data-admin.ts` + `emit.ts` | llamantes verificados uno a uno | ✅ |
| I-3 | migración + `supabase-data-admin.ts:1992` | único llamante con `p_spot_id` verificado | ✅ |
| I-4 | migración (CHECK → trigger) | comportamiento reproducido en prod sobre tabla temporal | ✅ |
| I-5 | `catalog.ts`, `recipients.ts`, `engine.test.ts` | 3.345 tests; gemelos con default `['CONFIRMADA']` intactos | ⚠️ parcial |
| I-6 | `supabase-data-admin.ts`, `oauth/v1/clientas` | test guardián con control positivo re-verificado | ✅ |
| I-7 | `app/api/comunidad/posts/route.ts` | prefijo contrastado con `getPublicUrl` | ✅ |
| I-8 | `supabase-data-admin.ts:741,748` | grep exhaustivo de consumidores + tsc | ✅ |
| I-9 | `portal-ajustes-view.tsx`, `portal-perfil-view.tsx` | gemelo `cuenta-widget/mi-perfil.tsx` comprobado (ya correcto) | ✅ |
| I-10 | `notifications/client.ts` + los dos toggles | tsc + lint | ✅ |

**Fallo encontrado en mi propio parche por el revisor independiente (y corregido):** la primera versión de `cancelar_reserva_plaza` leía `(oferta_expira_en is not null)` sin cualificar. Esa columna es también una **variable OUT** del `RETURNS TABLE`, así que el cuerpo entero habría reventado con `42702 column reference is ambiguous` en su primera sentencia útil — **dejando al producto sin poder cancelar ninguna reserva, ni desde el portal ni desde el mostrador**. `create or replace` no lo detecta (no planifica el cuerpo), y typecheck, lint y 3.343 tests estaban en verde. Corregido a `reservas.oferta_expira_en` y **verificado contra producción** con control positivo: la versión sin cualificar da `42702`; la corregida llega a `RESERVA_NO_ENCONTRADA`.

---

## RESUMEN FINAL

**Problemas encontrados:** 🔴 4 · 🟠 16 · 🟡 ~14
**Solucionados y verificados:** 11 · **Parcial:** 1 (I-5) · **Pendientes:** 8 · **Refutados:** 5
**Archivos modificados:** 19 (+788 / −31), incluida 1 migración nueva de 406 líneas
**Tests:** 3.345 ejecutados, **3.345 pasan, 0 fallan** (3.343 antes del parche; +2 guardianes nuevos, ambos con control positivo verificado)
**Typecheck:** PASS (`lib/**`, `app/api/**`, `components/portal|notifications|comunidad`)
**Lint:** PASS (`lib`, `app/api`, `components/portal`, `components/notifications`), `--max-warnings 0`
**Build:** NO VERIFICADO — `next build` no cabe en el límite de tiempo del entorno. Lo cubre el CI del PR.
**E2E:** NO VERIFICADO — los 157 specs necesitan navegador y servidor. Lo cubre el CI (12 shards).

### Estado real post-auditoría

Tentare **está mejor construido de lo que sugiere la lista de arriba**. Las cosas difíciles —aislamiento entre tenants, idempotencia del webhook de Stripe, concurrencia de reservas, RLS— las verifiqué una por una y aguantan: `reservar_plaza` serializa con `FOR UPDATE` antes de contar aforo y tiene índices únicos parciales que impiden el overbooking; ninguna de las 41 rutas públicas toma `socioId` del cliente; el precio y el plan salen siempre de la BD. Lo que falla es más tonto y más caro: **funcionalidad que se despliega y nunca funciona, sin que nada lo diga.** Tres casos esta pasada, los tres con todos los checks en verde.

**Lo que sigue abierto y me preocupa, por orden:** (1) las condiciones de salud legibles sin consentimiento — es el único hallazgo con exposición legal real y datos reales afectados hoy; (2) la UX de sesión caducada, porque puede hacer que una socia pague dos veces por el mismo bono; (3) el fix del reembolso POS, inerte y esperando a que alguien descongele la pantalla.

**Lo que NO he podido verificar:** el build de producción y los e2e (límite del entorno; el CI los cubre en el PR). No he forzado un 401 real contra producción para I-12: se deduce del código. No he revisado Sentry (sin conector en esta sesión). Y no puedo demostrar la ausencia de bugs en lo que no miré: la auditoría se centró en los 62 commits nuevos y en las áreas de dinero, reservas, identidad y multi-tenancy.

**Antes de ponerlo delante de cientos de estudios**, lo que yo exigiría no es más código: es que **algo compruebe que una feature nueva funciona de verdad en producción el día que se despliega**. Los dos tests guardianes de este PR van en esa dirección, pero son parches sobre el síntoma. El patrón se repite desde hace tres pasadas y el CI, con todo lo bueno que tiene, no lo ve.
