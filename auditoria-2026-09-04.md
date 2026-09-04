# Auditoría Tentare — 23ª pasada (4 sep 2026)

**Árbol auditado:** `origin/main` @ `35734fbc` (worktree limpio).
**Parche con todos los cambios:** `audit-04sep.patch` (26 ficheros, aplica limpio sobre `35734fbc`).

---

## 0. Lo primero: el árbol local NO era el proyecto

El árbol de trabajo (`claude/theme-builder-imagen-rota`) estaba **243 commits y 10 días por detrás de `main`**. Auditar ahí habría sido auditar código que ya no existe. Toda la auditoría se hizo sobre un worktree limpio de `origin/main`.

Es la segunda vez que pasa (ya ocurrió el 19-ago). **Recomendación de proceso: la auditoría debe empezar siempre con `git fetch` + comprobación de distancia con `main`, y negarse a continuar si el árbol está por detrás.**

---

## ESTADO REAL DE TENTARE

| Dimensión | Estado |
|---|---|
| **Estado general** | Sólido en lo estructural. El producto ya no falla por arquitectura: falla por **cadenas rotas entre capas** y por **gemelos divergentes**. |
| **Riesgo de seguridad** | **Bajo y verificado**, no supuesto (ver §1). El aislamiento entre estudios se probó contra producción y aguanta. |
| **Riesgo de datos** | Medio. Sin corrupción activa. La bifurcación Veri\*Factu es histórica y está documentada, no viva. |
| **Riesgo de dinero** | **Medio-alto.** Los caminos de cobro están bien; lo que falla son las **redes de recuperación** (§3.1, §3.2). |
| **Riesgo de negocio** | **Alto en un punto concreto:** la app de la alumna rechazaba compras sin decir por qué (§2.1). Corregido. |
| **Deuda técnica** | Contenida y medible: 0 `@ts-ignore`, 0 `console.log`, `any` en 2 ficheros de 1.521. La deuda real son 3 ficheros de +5.000 líneas y 90 exports muertos. |
| **Áreas más problemáticas** | 1) recuperación de pagos, 2) preferencias/consentimiento de avisos, 3) la app de la alumna (código de 10 días). |

### Lo que verifiqué que está BIEN (con evidencia, para que no se toque)

No todo hallazgo es un problema; decir qué está bien también es parte del trabajo:

- **Aislamiento entre estudios (RLS): probado contra producción, no inferido.** Asumí el rol `anon` en la BD real: **0 filas** en `socios`, `recibos`, `reservas`, `usuarios`, `sesiones`, `suscripciones` (y `permission denied` en 4 tablas más). Luego simulé a la propietaria de *Pilates doll* autenticada: ve **4 socias de 42**, **7 recibos de 7 propios**, **1 estudio de 6**. No hay fuga cross-tenant en la capa de datos. Esto cierra la familia abierta el 14-ago.
- **Los 15 trabajos `pg_cron` están instalados y activos en producción** (`cron.job`), y las 26 funciones Inngest definidas coinciden exactamente con las 26 registradas. Cero huérfanos.
- **`app/api/interno/**` (29 rutas): todas con `exigirPermiso`/`verificarAdminInterno`.** No encontré ninguna ruta de administración interna abierta.
- **El importe nunca sale del body** en ningún punto de entrada de cobro, y `socioId` se deriva del JWT en los dos checkouts de plan.
- **43 endpoints `/api/public/` revisados uno a uno:** no encontré ninguno que acepte `socioId`/`reservaId` del body sin comprobar propiedad. Ese vector está cerrado.

---

## 1. La bifurcación Veri\*Factu: NO es lo que la alarma decía

Sentry disparó `[verifactu] cadena de facturación bifurcada` **durante esta auditoría** (07:20 de hoy), en el área de dinero, nivel `error`. Lo perseguí hasta el final porque tenía toda la pinta de 🔴.

**Es un falso positivo, y la conclusión importa más que el bug.** En producción, las facturas seq 3 y seq 4 de `studio-1` comparten `prev_hash` (`9F28A13A79`). Pero la causa no es una carrera viva:

- La carrera **ya se cerró** el 29-jul: `reservar_numero_factura` toma `pg_advisory_xact_lock` por estudio, y las dos UNIQUE (`facturas_studio_verifactu_seq_key`, `facturas_studio_numero_completo_key`) **están confirmadas en producción**.
- Esa misma migración reparó el duplicado renumerando una factura de seq 3 → seq 4, **pero no reenlazó su `prev_hash`**. La "bifurcación" de hoy es el **residuo de la reparación**, sobre facturas de siembra jamás transmitidas a la AEAT.

**El problema real es otro:** un detector de integridad fiscal que grita todos los días desde el día uno por una condición permanente y conocida es un detector que se acaba silenciando — y entonces la bifurcación *de verdad* pasará desapercibida. Se le puso una exención nominal documentada (`studio-1:4`), de modo que **cualquier otra rotura sigue avisando**.

> **No se reescribió ninguna factura, ni hash, ni seq. No se tocó la base de datos.** Una factura emitida no se reescribe.

---

## 2. 🔴 CRÍTICOS

### [C-1] La alumna sin bono leía «Algo ha fallado, inténtalo de nuevo» ✅ SOLUCIONADO

**Área:** app de la alumna / conversión · **Archivos:** `lib/db/supabase-data-admin.ts`, `app/api/public/reserva/route.ts`, `lib/student/reservar.ts`, `components/student/domain/BookingStatus.tsx`

**Qué ocurría.** Todo rechazo de negocio al reservar se pintaba como avería genérica, con un botón «Intentar de nuevo» que iba a fallar exactamente igual, para siempre. La alumna **nunca leía** «Necesitas un plan o bono activo para reservar», que es la frase que la lleva a comprar.

**Por qué.** Una cadena rota en **tres saltos**, cada uno en un fichero distinto:
1. Los rechazos de derechos salían sin `codigo` → el `switch` caía en `default`.
2. **`app/api/public/reserva/route.ts` tiraba el `codigo` al serializar** (`{ error: r.error }`). Esto significa que **el `codigo` no había llegado NUNCA a ningún cliente**: los estados `full`, `duplicate` y `conflict` de la máquina de reserva **estaban muertos en producción desde siempre**.
3. La pantalla hacía `setBk(r.state)`, descartando el mensaje.

**Impacto.** Es el síntoma exacto que motivó tirar el portal entero («más de 400 rechazos de compra señalan al portal», commit `5aa3f150`) — y sobrevivió a la reconstrucción. Además, cada alumna sin bono levantaba un evento `level:'error'` en Sentry (visible ahora mismo: *student-pwa: reserva sin desenlace conocido*).

**Solución.** Los tres saltos reparados + los rechazos de negocio dejan de reportarse como averías. **Con un matiz que introdujo la revisión independiente:** propagar el mensaje sin filtro habría pintado a la alumna el error crudo de Postgres (`duplicate key value violates unique constraint…`). Se recorta en `lib/student/reservar.ts`, que es la capa que decide qué se enseña, dejando intacto el mapa fiel del servidor y sus tests.

---

### [C-2] Un impago SEPA tardío podía quedar como «cobrado» sin dinero ✅ SOLUCIONADO

**Archivo:** `lib/billing/dunning-server.ts:59`

`registrarFalloCobro` no acotaba el estado del recibo, así que un evento tardío o reenviado **resucitaba a PENDIENTE un recibo ya COBRADO o DEVUELTO** y le mandaba a la socia el email de impago de un cobro que sí se hizo.

**El matiz que salvó el fix.** La primera corrección excluía `COBRADO` sin más — y eso **habría creado un agujero peor**: un adeudo SEPA se marca COBRADO al liquidar y el banco puede devolverlo semanas después (R-transaction). Excluirlo habría dejado el recibo **COBRADO con dinero que nunca entró**, en silencio. La versión final admite `COBRADO` **solo en SEPA**; `DEVUELTO` nunca se resucita.

---

### [C-3] El cron de bonos e inactivas podía decir «0 avisos» sin haber mirado nada ✅ SOLUCIONADO

**Archivo:** `lib/notificaciones/bonos-inactivas-cron.ts`

Ninguna de sus 5 lecturas comprobaba `error` ni paginaba. Un fallo de PostgREST devolvía `data: null` → el bucle iteraba `[]` → `200 {"publicados":0}`, indistinguible de «no había nadie». Y **PostgREST corta en 1.000 filas en silencio**: con 180 días de `sesiones`, el mapa de última asistencia quedaba falso, avisando de «clienta inactiva» a gente que vino ayer.

Es el fallo que el propio repo documentó al lado (*«ya costó los backups, #684»*) y que este fichero se había saltado. Ahora pagina, propaga errores y trocea los `.in()` para no provocar un 414.

---

### [C-4] Apagar «Recordatorio de clase» silenciaba las cancelaciones ✅ SOLUCIONADO

**Archivo:** `app/portal/[slug]/perfil/preferencias/page.tsx`

Las etiquetas estaban **cruzadas con las categorías reales**: la fila «Recordatorio de clase · El día antes y un rato antes» gobernaba la categoría `clases`, que contiene `CLASE_CANCELADA`/`MODIFICADA`/`SUSTITUTA` — **no los recordatorios**, que viven en `reservas`.

La alumna que apagaba los recordatorios (a) los seguía recibiendo y (b) **dejaba de recibir el aviso de que su clase de mañana se ha cancelado** — el que evita que se presente a una clase que no existe. Exactamente lo contrario de lo que consintió.

Se corrigieron **las etiquetas, no el catálogo**: mover eventos entre categorías habría cambiado el comportamiento del motor y el significado de las filas ya guardadas.

---

## 3. 🔴 CRÍTICOS PENDIENTES (no era seguro arreglarlos hoy)

### [P-1] El backstop de disputas no ve nunca el cierre de una disputa ⏳ PENDIENTE

`lib/inngest/conciliar-reembolsos.ts:301` lista disputas por **`dispute.created`** en una ventana de 24 h. Una disputa se **resuelve** 30-75 días después de crearse, así que un `charge.dispute.closed` con `status:'lost'` nunca cae dentro de la ventana. El gemelo de reembolsos sí razonó justo esto y la lógica no se trasladó.

Como el webhook responde 200 *antes* de procesar, este cron es el único rescate — y no llega. **Consecuencia: recibo COBRADO para siempre sobre un chargeback perdido.**

**Por qué no lo toqué:** el arreglo correcto no es mover la ventana, es **invertir la consulta** (iterar recibos con disputa abierta y hacer `disputes.retrieve` de cada una). Eso es rediseñar el bucle del conciliador, con riesgo de doble procesamiento si se hace deprisa. Es el primer candidato para la próxima sesión.

### [P-2] Doble suscripción del estudio, y la segunda borra el rastro de la primera ⏳ PENDIENTE

`app/api/billing/checkout/route.ts:164,215` crea la sesión de suscripción **sin `idempotencyKey`** (su gemelo de socias, `app/api/stripe/checkout/route.ts:396`, sí la lleva). El único guardia lee un estado que solo escribe el webhook **después** de pagar. Y `app/api/billing/webhook/route.ts:155` **pisa** `subscription_id` sin comprobar si ya había otro distinto activo.

**El estudio paga dos veces su plan cada mes y la primera suscripción queda huérfana.** No lo arreglé porque la parte de «qué hacer con la vieja» (cancelarla, avisar, ambas) es una decisión de producto, no de código.

### [P-3] El conciliador entrega el plan pero no consume el código de descuento ⏳ PENDIENTE

El webhook consume el uso en sus dos ramas; `lib/inngest/conciliar-cobros.ts` **no menciona `consumir_codigo_descuento` en ninguna línea**. Cuando el rescate lo hace el cron —el camino real en 4 de cada 6 cobros, según la propia cabecera del fichero— un código de un solo uso **queda reutilizable indefinidamente**.

El fix correcto es extraer el bloque a un helper compartido por los tres sitios; lo dejé porque toca el camino de entrega y merece su propia verificación.

### [P-4] `/api/emails/send` es un relay de correo abierto para cualquier staff ⏳ PENDIENTE

Solo comprueba `verificarSesionStaff`, **sin rate limit y sin comprobar el rol**. Un INSTRUCTOR puede enviar correos con asunto y cuerpo arbitrarios a **direcciones arbitrarias**, en volumen ilimitado, firmados desde `hola@tentare.es` — el dominio verificado que comparten **todos los tenants**. El radio de explosión no es su estudio: es la reputación de envío del SaaS entero.

No lo arreglé porque acotar el destinatario («solo socias del estudio») puede romper envíos legítimos que no he podido inventariar. **Es el 🔴 que yo atacaría primero después de P-1.**

### [P-5] Una oferta de lista de espera no se puede aceptar desde la app nueva ⏳ PENDIENTE

El aviso enlaza a `/reservas?tab=ESPERA`; esa pantalla no existe con ese tab, y **no hay ni una sola referencia a «aceptar oferta» en toda la PWA nueva** (los dos endpoints solo los llama el widget viejo). El cron le quita la plaza al caducar. La socia pierde una plaza que tenía ofrecida. Requiere UI nueva.

### [P-6] Los recordatorios por email y WhatsApp no tienen opt-out posible ⏳ PENDIENTE

`preferencias_socio` gobierna esos envíos y **no tiene ningún escritor en todo el repo** (0 INSERT/UPDATE). Sin fila → `?? true` → siempre se envía. Y el motor de notificaciones usa **otro** almacén (`notification_preference`), así que la pantalla que sí existe no puede frenarlos. Son dos sistemas de preferencias divergentes: uno con UI que no gobierna nada, otro que gobierna y no tiene UI. RGPD art. 7.3.

### [P-7] Clave `sk_live` caducada en producción 🔎 OPERATIVO, NO DE CÓDIGO

Sentry registra **266 eventos** de `Expired API Key provided: sk_live_…XUaBvx` en `POST /api/inngest` y 6 en `/api/public/checkout-embebido`, todos hace 12 días y **ninguno posterior**. Encaja con la rotación tras la fuga del 20-ago. Parece resuelto, pero **conviene confirmar que ningún entorno (preview, cron) conserva la clave vieja**: mientras la tuvo, los cobros de ese camino fallaban.

---

## 4. 🟠 IMPORTANTES SOLUCIONADOS

| ID | Problema | Archivo |
|---|---|---|
| I-1 | `charge.dispute.funds_reinstated` exigía `event.account`, así que **no se ejecutaba nunca para el único estudio que cobra de verdad** (usa la cuenta de plataforma; sus eventos llegan sin `account`). | `app/api/stripe/webhook/route.ts` |
| I-2 | Un reembolso **parcial** de una venta POS la marcaba como **totalmente devuelta** (5 € de 50 € → venta entera contada como devuelta). | `lib/billing/registrar-devolucion.ts` |
| I-3 | El conciliador entregaba **peor** que el webhook: perdía `spotId` (la socia que pagó por una camilla concreta acababa en otra) y creaba la ficha sin teléfono ni datos de alta. Gemelo divergente. | `lib/inngest/conciliar-cobros.ts` |
| I-4 | **Bucle infinito de redirecciones 308** en el catch-all del portal: `/portal/x/acceso/entrar` crecía un segmento por salto hasta `ERR_TOO_MANY_REDIRECTS`, y con 308 **permanentes** que el navegador cachea. Afecta a enlaces impresos (QR de la puerta, bio de Instagram). | `app/portal/[slug]/[...resto]/route.ts` |
| I-5 | Guardar una preferencia **borraba las otras** y devolvía `{ok:true}`: `upsert` de fila completa contra un cliente que manda un solo campo. La pantalla seguía enseñando el valor que el backend acababa de borrar. | `app/api/notifications/preferences/route.ts` |
| I-6 | Dos rutas del datáfono (`lector`, `reconciliar`) **no comprobaban rol** y corrían con service-role: un INSTRUCTOR podía desemparejar el datáfono o falsear el cierre de caja. Su hermana `cobrar` sí lo comprobaba. | `app/api/terminal/*` |
| I-7 | `studio_id` escrito **crudo del body** en preferencias y suscripción a push. | `app/api/notifications/*` |
| I-8 | `studio-data` autorizaba **por email** mientras el resto del sistema autoriza por `auth_user_id`. Al corregir el email de una clienta, esta abría su app con sesión válida y veía **cero reservas, cero bonos, cero pagos**, sin ningún error, pero podía seguir reservando. | `lib/db/supabase-data-admin.ts` |
| I-9 | **Consecuencia de I-8, detectada por la revisión independiente:** quitar el filtro por email sin más convertía un fallo de *disponibilidad* en uno de *confidencialidad* — al reasignar una ficha a otra persona, la anterior conservaba el `auth_user_id` y vería los datos de la nueva. Se añadió el desvinculado del `auth_user_id` al cambiar el email (auto-reparable: se vuelve a enlazar en el siguiente inicio de sesión). | `lib/supabase-data.ts` |

---

## 5. 🟠 IMPORTANTES PENDIENTES

- **El enlace de invitación al equipo es una credencial al portador de 30 días**, no ligada a ningún email y **no revocable** (HMAC sin `jti`). Quien lo obtenga se convierte en staff — y un INSTRUCTOR ve la ficha clínica completa de todas las socias. Requiere decidir el formato del token.
- **Desactivar a alguien del equipo no cierra su sesión.** La API le da 401, pero nadie revoca el JWT y `ErrorSesionCaducada` **no la captura nadie** (0 referencias fuera de su definición). Se queda dentro del panel viendo errores genéricos.
- **`cerrar-pruebas-vencidas` corta el acceso cada 15 min sin avisar a nadie**, ni antes ni después: no hay evento de prueba en el catálogo ni plantilla de email. La dueña entra un lunes y el panel está bloqueado.
- **Las entregas `FAILED` no se reintentan nunca.** `retry()` no tiene ni un llamador, no hay botón en la UI, y el barrido solo recoge `PENDING`. Si se llamara, además convertiría el `FAILED` en `SKIPPED`, borrando el fallo del historial.
- **`/api/marketing/baja` responde «Baja confirmada» sin comprobar el `error` del UPDATE.** Es el único mecanismo de baja del producto.
- **`sellarRectificativaDeFactura` no tiene el guardia D-2** que sí tiene su gemela. Hoy no es explotable (el llamador deriva el id de un hash), pero la defensa vive solo en el llamador.
- **`/api/public/alta-al-entrar` crea socias sin traza de consentimiento** (RGPD art. 7.1) y **ya no lo llama nadie**: su único cliente murió con el portal viejo. Candidato a borrar junto con `lib/portal-auth.tsx`.

---

## 6. 🟡 MEJORAS DESTACADAS

- **90 exports sin ninguna referencia** (2,9% de 3.077), incluidos dos módulos muertos enteros (`lib/social-companeras-portal.ts`, `lib/documentos-socio-portal.ts`) y 10 funciones muertas en `lib/api-client.ts`.
- **Tres ficheros suman 14.560 líneas** (`lib/supabase-data.ts` 5.157, `lib/studio-context.tsx` 5.038, `lib/db/supabase-data-admin.ts` 4.365): 6,2% del código en 0,2% de los ficheros.
- **93 `eslint-disable` de `react-hooks/set-state-in-effect`**: deuda concentrada y real.
- Ventana de sobre-uso de códigos de descuento (se validan al abrir el checkout, se consumen en el webhook).
- 4 constantes de evento Inngest declaradas sin emisor ni consumidor.

**Lo que NO es deuda:** 0 `@ts-ignore`, 0 `@ts-expect-error`, 0 `console.log`, y `any` confinado a 2 ficheros de 1.521. Es un resultado excelente y merece decirse.

---

## 7. MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Buena; el problema no es el diseño | Bajo | — |
| Frontend | Correcto; 3 ficheros gigantes | Medio | 3 |
| Backend | Sólido; gemelos divergentes recurrentes | Medio | 2 |
| Base de datos | Alineada con el repo; UNIQUE y locks en su sitio | Bajo | — |
| **RLS** | **Verificado contra producción: aísla** | **Bajo** | — |
| Auth | Flujos de baja e invitación a medias | Medio-alto | 2 |
| **Pagos** | Caminos bien; **redes de recuperación rotas** | **Alto** | **1** |
| Reservas | Corregido hoy lo peor | Medio | 3 |
| Calendario | Sin hallazgos nuevos | Bajo | — |
| Automatizaciones | Crons vivos; éxitos falsos corregidos en parte | Medio | 3 |
| Avisos/consentimiento | **Dos sistemas de preferencias divergentes** | Alto | 2 |
| UX | Mejor tras C-1/C-4; queda la lista de espera | Medio | 3 |
| Seguridad | Buena base; relay de email abierto | Medio-alto | 1 |
| Tests | 3.536 verdes, pero cubren periferia | Medio | 4 |
| Infraestructura | 15 crons activos, CI con lint+typecheck+test | Bajo | — |

---

## 8. PLAN DE LIMPIEZA

**FASE 1 — Dinero (lo único que pierde euros hoy):** P-1 (backstop de disputas), P-3 (código de descuento en el conciliador), P-2 (idempotencia del checkout del estudio). Confirmar P-7.
**FASE 2 — Seguridad y consentimiento:** P-4 (relay de email), token de invitación, revocación de sesión al dar de baja, P-6 (unificar los dos sistemas de preferencias).
**FASE 3 — Completar lo empezado:** P-5 (aceptar oferta de lista de espera), reintento real de entregas fallidas, avisos de fin de prueba.
**FASE 4 — Consolidación:** partir los 3 ficheros gigantes, borrar los 90 exports muertos y `alta-al-entrar`.
**FASE 5 — Calidad:** tests de comportamiento para las cadenas entre capas (no solo funciones puras), los 93 `set-state-in-effect`.

---

## 9. LA CAUSA RAÍZ, Y ES UNA SOLA

Tres auditorías seguidas han señalado **gemelos divergentes** como la clase de fallo dominante, y ninguna la ha reducido. Hoy vuelve a ser la causa de I-1, I-2, I-3, C-2, P-2 y P-3: *dos caminos hacen lo mismo, se arregla uno, el otro se queda atrás.*

Pero esta pasada añade una variante más cara y menos visible: **la cadena rota entre capas**. C-1 no fue una función equivocada; fueron **tres saltos correctos por separado** que no se hablaban entre sí, en tres ficheros distintos, cada uno con sus tests en verde. Y el más grave (el `codigo` que la ruta se comía) llevaba ahí **desde siempre**, invisible.

**Esto es lo que yo cambiaría del proceso, y es la recomendación más importante del informe:**

1. **Los tests son de funciones puras, no de cadenas.** Por eso 3.513 tests en verde no detectaron que la máquina de estados de reserva llevaba meses muerta en producción. Hacen falta tests que recorran *origen → API → cliente → pantalla*. Añadí uno (`lib/student/cadena-rechazo-reserva.test.ts`) como plantilla del idioma.
2. **Cuando se arregle un endpoint, buscar su gemelo en el mismo commit.** Un `grep` del nombre de la función arreglada, siempre. Sería barato y habría evitado seis hallazgos de hoy.
3. **La revisión independiente vale su coste.** De 13 fixes aplicados, una segunda pasada escéptica encontró **3 defectuosos con typecheck, lint y 3.532 tests en verde** — incluida una regresión nueva (pintar el error de Postgres a la alumna) y un agujero de dinero que el propio comentario del fix se autodesmentía (C-2). Sin esa pasada, habría entregado los tres como correctos.

---

## RESUMEN FINAL

**Problemas encontrados:** 🔴 11 · 🟠 16 · 🟡 9 (36)

**Solucionados y verificados:** **13** (C-1 a C-4, I-1 a I-9)
**Parcialmente solucionados:** 1 — C-1 arregla los rechazos con código; quedan ~4 rechazos de negocio en `crearReservaPublica` que siguen sin `codigo` (`clase cancelada`, `clase ya empezada`, `sesión no encontrada` en su retorno temprano).
**Pendientes:** **20**, cada uno con su motivo explícito en §3 y §5.
**No verificados:** 2 — si algún entorno conserva la `sk_live` caducada (P-7), y si algún estudio tiene el plazo de lista de espera activo en producción (P-5).

**Archivos modificados:** 23 · **Ficheros de test nuevos:** 3
**Tests:** 3.536 pass / **0 fail** (línea base 3.513; +23 nuevos)
**Typecheck:** ✅ PASS · **Lint:** ✅ PASS
**Build:** ⚠️ **NO VERIFICADO** — el sandbox no tiene red y `next/font` no puede descargar Google Fonts desde `app/layout.tsx`, fichero que no toqué. Único fallo del build; nada de código.
**E2E:** ⚠️ NO EJECUTADO (requiere navegador y entorno con red).

**Verificación reforzada:** el parche se aplicó sobre un **clon limpio de `main`** y allí se repitieron typecheck, tests y lint. Esto **no fue ceremonia**: en mi árbol de trabajo `tsc` daba verde con caché incremental mientras en el árbol limpio fallaba un fichero nuevo. Ese error habría llegado a producción con todos los checks en verde.

### Nivel de confianza

**Alto** en lo verificado contra producción: el aislamiento entre estudios, los crons, el estado de la cadena Veri\*Factu y las migraciones. **Alto** en los 13 fixes: revisados por un tercero escéptico, corregidos tres, y validados en árbol limpio.

**Medio** en las áreas que solo pude leer: no ejecuté ningún flujo de pago real, ni E2E, ni el build. **Bajo** en una cosa concreta y quiero decirlo claro: **no puedo afirmar que los caminos de recuperación de pagos funcionen.** P-1 y P-3 dicen justo lo contrario, y son código que solo se ejecuta cuando algo ya ha fallado — el que menos se prueba y más caro sale.

**Antes de poner Tentare delante de cientos de estudios**, yo exigiría: cerrar la Fase 1 completa, cerrar P-4, y montar una prueba de extremo a extremo del ciclo del dinero (cobro → fallo → reintento → reembolso → disputa) contra la sandbox de Stripe. Hoy ese ciclo **no tiene ninguna cobertura automática**, y es exactamente donde este informe encuentra más agujeros pasada tras pasada.

*No he encontrado fugas entre tenants tras probarlo contra producción; eso no es lo mismo que decir que no existan en caminos que no recorrí.*
