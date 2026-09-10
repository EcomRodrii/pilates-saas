# Auditoría Tentare — 27ª pasada (8 sep 2026)

**Base auditada:** `f9fa8ec8` (`origin/main`, tip real del día).
**Entrega:** `audit-08sep.patch` (aplicar con `git am audit-08sep.patch` sobre `f9fa8ec8`) + una migración **ya aplicada en producción**.

---

## ESTADO REAL DE TENTARE

- **Estado general:** el producto está mucho mejor construido de lo que sugiere la lista de abajo. Lo que encuentro ya no son bugs de camino feliz: son **piezas que nunca han funcionado en producción y que nadie podía ver que no funcionaban**.
- **Riesgo técnico:** medio. Lo estructural (crons, Inngest, idempotencia de webhooks, RLS, multi-tenant) está sano y lo he verificado contra producción, no contra el código.
- **Riesgo de seguridad:** bajo-medio. Una escalada entre roles de staff (cerrada hoy). No he encontrado ningún camino cross-tenant ni ninguna vía anónima nueva.
- **Riesgo de datos:** medio. El sello legal por compra fabricaba prueba de un consentimiento que no se recogió.
- **Riesgo de negocio:** **alto y concentrado en un punto**: si Stripe se desconecta en 6 de los 9 estudios activos, **nadie se entera**. El aviso existe, es CRÍTICA, y no tenía por dónde salir.
- **Deuda técnica:** la clase dominante no ha cambiado — **gemelos divergentes**. 5 de los 8 hallazgos de hoy son «se arregló un lado y no el otro».
- **Áreas más problemáticas:** notificaciones externas (email), la aceptación legal por compra (desplegada hoy), y el cobro por Bizum del mostrador (desplegado ayer).

### La clase de fallo de esta pasada

Las pasadas anteriores fueron cerrando *bugs*. Lo de hoy es distinto y peor de detectar: **funcionalidad desplegada, con su UI, sus tests y su cron corriendo en verde, que no ha producido nunca su efecto**. El motor de notificaciones lleva desde que existe respondiendo `HTTP 200` cada hora con `{avisos: 0}`; el sello legal escribe un hash en cada recibo; el resumen semanal reporta `fallidos: 0`. Los tres estaban rotos. Ningún check lo decía porque **todos miden que el proceso corrió, no que la persona recibiera algo**.

---

# 🔴 CRÍTICOS

### [C-1] La propietaria no tiene canal de email: los avisos críticos no pueden salir del navegador — ✅ SOLUCIONADO

**Área:** notificaciones · **Archivos:** `lib/notifications/recipients.ts:10-20`, `lib/notifications/process.ts:262-264`, `lib/decision/resumen-semanal-cron.ts:69`

**Evidencia (producción, 8 sep 2026):**

| comprobación | resultado |
|---|---|
| estudios activos sin `studios.email` | **6 de 9** |
| entregas `EMAIL` en toda la historia de `notification_delivery` | **4**, todas `SKIPPED` |
| error de esas 4 | `destinatario sin email` |
| tipos de aviso afectados | `sistema.trial_expirado` |

**Qué ocurre:** `propietaria()` resolvía el email de la dueña leyendo **solo `studios.email`**, que es el email *público de contacto del estudio* — un campo opcional de Configuración que la mayoría no rellena. Cuando está vacío, la destinataria sale sin email y todos los canales externos se saltan.

**Por qué ocurre:** el fallback correcto ya estaba escrito **40 líneas más abajo, en el mismo fichero** (`porAuthUserId`, para Network, que sí usa `auth.users`). Simplemente no se aplicó a la propietaria. Gemelos divergentes.

**Impacto:** las dos alarmas CRÍTICA del producto —`SISTEMA_STRIPE_DESCONECTADO` («se deja de cobrar») y `SISTEMA_ERROR`— más `TRIAL_EXPIRADO` y `TRIAL_PROXIMO_A_EXPIRAR` **no tienen forma de llegar** a 6 de 9 estudios salvo que la dueña esté mirando el panel. El cron de trial lleva desde el 5-sep devolviendo `{"estudios":6,"avisos":0,"bloqueos":4}` con HTTP 200 cada hora.

**Por qué era invisible:** `avisarFallos` excluye `SKIPPED` a propósito (`process.ts:59-61`, «este canal no aplica todavía»), que es razonable en general y falso para una CRÍTICA.

**Solución aplicada:** helper `emailDeLaPropietaria` — email público si lo hay, si no el de la cuenta (`auth.users`), no fatal si la consulta falla. Aplicado en los **tres** sitios: `propietaria()`, `staffPorAuthUserId()` y el camino que de verdad envía (`entregarExternos`, que re-resolvía por su cuenta). Cacheado por usuario dentro de la tanda.

> ⚠️ **Mi primer arreglo de esto estaba mal y no lo detectó ningún test.** Parcheé `recipients.ts` y di el problema por cerrado; la revisión independiente encontró que `process.ts:262` **sobrescribe** el email con `studios.email` y que ese es el camino que envía. Sin esa segunda pasada, este informe habría dicho «solucionado» sobre un cambio de efecto **cero**.

**Verificación:** 5 tests nuevos (`lib/notifications/destinatario-propietaria.test.ts`) que prueban las dos direcciones — que cae a la cuenta cuando falta, y que **no** pisa el del estudio cuando está. Suite completa 4.158/4.158.

**Riesgo residual:** un estudio cuya dueña no tenga email en `auth.users` sigue sin canal, pero eso no puede pasar (es con el que entra). **No he verificado el envío de punta a punta contra Resend**: hace falta provocar un aviso real.

---

# 🟠 IMPORTANTES

### [L-1] El sello de condiciones certifica un texto que la compradora no vio — ✅ SOLUCIONADO

**Área:** legal/pagos · **Archivo:** `lib/legal-sellado.ts:41-50` · **Desplegado hoy** (#1756)

Se le pasaba a `configLegalDe` la **fila cruda de `studios` en snake_case**, mientras la interfaz `DatosEstudioLegal` es camelCase **con todos los campos opcionales** — así que TypeScript lo aceptaba y se descartaban en silencio:

| campo | portal | servidor (lo que sellaba) |
|---|---|---|
| razón social | «… SL» | **el nombre comercial** |
| código postal | sí | **se perdía** |
| ventana de cancelación | la configurada | **siempre 12 h** |
| cláusula de penalización | incluida | **nunca** |

**Impacto:** el único recibo sellado hasta ahora (`rec-web-3UDQRmJyFtzyfjtm1WdZrHua`, studio-1) identifica como responsable del tratamiento a una entidad **que no es la que factura**. Ante una reclamación, ese registro es peor que no tener registro.

**Por qué el test existente no lo cazó:** anclaba que servidor y portal *llaman a la misma función*, y eso era cierto mientras el documento sellado y el mostrado eran distintos. **Se anclaba la función, no la forma.**

**Solución:** mapeo explícito extraído a `datosLegalesDeFila()` (en `legal-textos.ts`, que es puro y testeable — `legal-sellado.ts` es `server-only`), y `select` ampliado con `cancelacion_ventana_horas` y `penalizacion_importe_eur`. Dos tests nuevos: uno ancla la **forma**, otro comprueba que pasar la fila cruda produce un hash **distinto**.

### [L-2] El portal no enseña ninguna condición en 10 de 11 estudios, y el servidor sella igual — ✅ SOLUCIONADO

**Archivo:** `app/portal/[slug]/comprar/page.tsx:50-55`

Se leían los textos **crudos** del estudio; con `politica_privacidad` y `terminos_servicio` a NULL en 10 de 11 estudios, el resultado era `null` → la pantalla **no pintaba nada legal** mientras el recibo recibía `terminos_hash` y `terminos_aceptados_en`. El caso mixto (privacidad sí, términos no) abría un **diálogo vacío**.

**Solución:** pasa por `configLegalDe`, la misma composición efectiva que sella el servidor. De paso: `configLegalDe` usaba `??`, que dejaba pasar la cadena vacía — un estudio que borrara el editor sellaba un documento **en blanco**; ahora vacío significa «no lo he reescrito».

Y el tipo `Payload.studio` (`lib/student/catalogo.ts`) **declaraba menos campos de los que el payload transporta**, que es por lo que el código anterior necesitaba un cast. Contrato ampliado: el cast desaparece.

### [S-1] Tres RPC de créditos comprueban el estudio pero no el rol — ✅ SOLUCIONADO (en producción)

**Área:** seguridad/RLS · **Migración:** `20260908170000_creditos_rpcs_comprueban_rol.sql`

`ajustar_creditos`, `ajustar_stock` y `cancelar_canje` son `SECURITY DEFINER` con `EXECUTE` para `authenticated`, y solo validaban el estudio. Sus hermanas de la misma familia sí validan rol (`ampliar_caducidades` → `puede_mover_dinero`, `consumir_sesion_bono` → `puede_gestionar_calendario`). Gemelos divergentes, otra vez.

**Alcance real, acotado:** una **alumna NO llega** — `current_studio_id()` solo resuelve para propietarias e instructoras, y para ella devuelve `null` → `STUDIO_MISMATCH`. Pero una **instructora** del estudio sí, y podía, sin tocar el panel: restar créditos a cualquier socia, inflar `total_ganado`/`total_canjeado` (lo que pintan los rankings), alterar el stock del catálogo y cancelar el canje de otra.

**Verificado en producción tras aplicar:** los tres guards están dentro; el camino service-role (el del portal) sigue pasando — devuelve `SIN_STOCK`, no `NO_AUTORIZADO`; los privilegios no se alteraron (`authenticated`/`service_role`, sin `PUBLIC`/`anon`).

**Riesgo residual:** ninguno detectado. El único camino autenticado vivo (`tab-canjes.tsx`) es de `/configuracion`, cerrada a todo lo que no sea PROPIETARIO.

### [I-1] «Serie cancelada · clientas avisadas» sin haber medido un solo envío — ✅ SOLUCIONADO

**Archivos:** `lib/studio-context.tsx:3095`, `lib/api-client.ts:1661`, `app/(dashboard)/calendario/page.tsx:1482`

`notificarCancelacionSesiones` disparaba `enviarEmailCancelacionClase` en un `.forEach` **sin `await`** — y esa función devuelve `boolean` y **nunca lanza**, así que el resultado se tiraba al suelo. `avisarClaseCancelada` era `Promise<void>` y un 401/404/500 era indistinguible del éxito.

El camino de **clase suelta ya se había arreglado** por esto exacto, con el comentario puesto. Sus gemelos —cancelar serie y eliminar clase— se quedaron atrás.

**Impacto:** la propietaria cancela la serie del verano, lee «12 clases · clientas avisadas», y N alumnas se presentan a una clase que no existe.

**Solución:** `avisarClaseCancelada` → `Promise<boolean>`; `notificarCancelacionSesiones` async devolviendo `{avisadas, sinAvisar}`; propagado por `deleteSesion` y `cancelarSerieDesde`; los toasts dicen «X avisadas · Y sin avisar» o «sin aviso en la app». Se preservó el orden deliberado (avisar **antes** de cancelar reservas y del DELETE).

> La revisión detectó que al pasar de fire-and-forget a `await` introduje un **cuelgue nuevo**: `enviarEmailCancelacionClase` no tenía `AbortSignal.timeout`. Añadido (10 s, igual que su hermana).

### [I-2] Un resumen semanal que no sale no se cuenta ni se ve — ✅ SOLUCIONADO

`lib/decision/resumen-semanal-cron.ts:31` solo contaba excepciones, y `enviarEmailResumenSemanal` **nunca lanza** (devuelve `{ok:false}` en sus tres caminos). Una caída de Resend un lunes daba el mismo `{enviados:0, fallidos:0}` + Sentry limpio que «ninguna semana fue silenciosa». Y como la fila de dedup se reclama **antes** de enviar (correcto, para no duplicar), ese estudio **no recibe el resumen de esa semana nunca**.

Además arrastraba el mismo fallo que C-1 (`if (!studio?.email) return skipped`), con lo que no llegaba a casi ningún estudio y ni siquiera contaba como fallo.

### [I-3] Una campaña puede quedarse en «Enviando…» para siempre — ✅ SOLUCIONADO

`app/api/marketing/campanas/[id]/enviar/route.ts:55`: el compare-and-set deja `ENVIANDO` en la BD y **después** llama a `inngest.send()` fuera de todo `try`. Si el encolado falla, la campaña queda en `ENVIANDO`, el propio CAS impide reintentarla, no hay barrido de atascadas y ninguna pantalla la devuelve a BORRADOR. Ahora se revierte a BORRADOR y responde 503 con salida.

### [I-5] El apunte de caja del cobro manual se perdía sin rastro — ✅ SOLUCIONADO

`lib/studio-context.tsx:3945`: `void apuntarCobroEnCaja(id).catch(() => {})` — pero esa llamada va por `pedir()`, que **nunca rechaza**: devuelve `{error}`. El `.catch()` era código muerto y el fallo real se descartaba sin toast, sin Sentry y sin consola, dejando el descuadre de caja «sin ninguna pista de dónde venía» que ese mismo bloque decía haber cerrado.

---

# 🔴 PENDIENTE (no lo he arreglado, y por qué)

### [P-1] Bizum del mostrador: el enlace de pago sigue vivo tras cancelar → **doble cobro real**

**Severidad:** 🔴 · **Archivos:** `lib/pos/terminal.ts:245-250` y `:280-287`, `app/api/pos/venta/confirmar/route.ts:85` · **Desplegado ayer** (#1744)

Bizum del TPV es una **Checkout Session**, no un PaymentIntent suelto. En la línea 249 se guarda solo el PI y **el `sesion.id` se descarta** — y `ventas_pos` no tiene ninguna columna donde guardarlo (verificado: 32 columnas, ninguna de sesión). Por tanto **la sesión no se puede expirar desde ningún sitio**, y `cancelar()` intenta `paymentIntents.cancel` sobre un PI que pertenece a una Checkout Session.

**Cómo reproducirlo:** TPV → ticket → Bizum → la clienta escanea y no paga → «Cancelar» → se cobra en efectivo → la clienta paga el QR (sigue válido 24 h) → `payment_intent.succeeded` cierra la venta original → **dos ventas PAGADAS del mismo ticket y stock descontado dos veces**.

**Por qué no lo he arreglado:** requiere **columna nueva** en `ventas_pos` + migración + cambio en el camino del dinero, y **no puedo probarlo contra Stripe** desde aquí. Es exactamente el tipo de cambio que las reglas de trabajo mandan documentar en vez de improvisar.

**Cómo arreglarlo (el gemelo ya lo hace bien):** `app/api/stripe/checkout/route.ts:330` usa `stripe.checkout.sessions.expire(...)`. Guardar `sesion.id` en una columna nueva, llamar a `sessions.expire` en `cancelar()`, y añadir `expires_at` (30 min) al crear la sesión para acotar la ventana aunque nadie cancele.

**Atenuante:** Bizum **nunca ha llegado a funcionar** en producción (3 ventas `BIZUM/ANULADA/ERROR` del 7-8 sep, ninguna pagada desde julio). #1744 es justo lo que acaba de abrir este camino, así que el riesgo empieza ahora.

### [P-2] Una venta POS con Bizum rechazado se queda colgada reteniendo stock

🟠 · `app/api/stripe/webhook/route.ts:1132`: `payment_intent.payment_failed` **solo** atiende `sepa_recibo`; no hay rama para `pos_bizum`/`pos_terminal`, ni se maneja `checkout.session.expired` en ningún sitio. El único que anula la venta y devuelve el stock es el sondeo del navegador, que muere a los 90 s. Verificado que ningún conciliador cubre `ventas_pos` pendientes. **No arreglado:** toca el webhook del dinero y va emparejado con P-1; hacerlo suelto arregla medio caso.

### [P-3] Un Bizum pagado con tarjeta se contabiliza como BIZUM

🟠 · `app/api/stripe/webhook/route.ts:704`: el método se deduce del **origen** (`metadata.origen === 'pos_bizum'`), no del cargo — pero #1744 cambió la sesión a `['card','bizum']` precisamente para que la clienta pague con lo que tenga. El gemelo lo hace bien 260 líneas más arriba (`:444`, lee `latest_charge.payment_method_details.type`). El total del arqueo cuadra; el desglose por método miente. **No arreglado:** mismo fichero y misma sesión de trabajo que P-1/P-2, mejor de una vez.

### [P-4] La pantalla de preferencias de la socia es un gemelo divergente del catálogo

🟠 · `app/portal/[slug]/perfil/preferencias/page.tsx:42-47`: lista **4 categorías a mano** cuando `CATEGORIAS_POR_ROL.SOCIA` son 5 (falta `mensajeria`), y el único interruptor de email está **cableado a `pagos`**. Consecuencia: una socia **no puede activar el email de `reservas` ni de `mensajeria` por ninguna vía**, y eso mata `RESERVA_ABANDONADA` (canal EMAIL único; 4 avisos en prod, 0 entregas) y `MENSAJE_DIGEST_NO_LEIDO` (canal EMAIL único; 2 avisos, 0 entregas), que es la razón de ser del cron `notif-mensajes-digest`. La pantalla de staff **sí** deriva del catálogo y por eso no divergió. **No arreglado:** es rediseño de UI (toggle de email por categoría), decisión de producto. **Arreglo correcto:** derivar las filas del catálogo, no añadir `mensajeria` a mano — añadirlo a mano deja la trampa puesta.

### [P-5] Código desplegado por delante de su migración, ya roto en producción

🟠 · Sentry `JAVASCRIPT-NEXTJS-2A`: `PGRST204: Could not find the 'menu_posicion' column of 'studios'`, 3 eventos, 1 usuaria, en `/configuracion/apariencia/panel`. **No arreglado:** no he podido determinar si sobra la columna en el código o falta en la BD sin arriesgarme a revertir el trabajo de #1736.

### [P-6] `terminos_aceptados_en` no es cuándo aceptó

🟡 · `lib/legal-sellado.ts`: el instante se calcula al **crear el PaymentIntent**, antes de que nadie acepte nada. Si abandona el checkout y paga 20 min después, el recibo dice que aceptó 20 min antes de pagar. **No arreglado:** o se renombra el concepto a `terminos_vigentes_en`, o se sella en `payment_intent.succeeded`. Es decisión de producto con implicación legal.

### [P-7] Comentarios que prometen una red de seguridad que ya no existe

🟡 · Desde que el webhook responde 200 antes de procesar (`route.ts:178`), ningún `return 500` dentro de `procesarEvento` provoca reintento de Stripe. Al menos cuatro sitios (`:715`, `:741`, `:799`, `:841`) siguen afirmando «5xx para que Stripe reintente». No es un bug; es **una señal falsa que dirige mal la próxima pasada**, y para las ramas POS el conciliador tampoco cubre.

---

## Verificado y REFUTADO (para que nadie lo vuelva a mirar)

- **Migraciones sin aplicar.** 6 migraciones locales cuyo *nombre* no aparece en `schema_migrations`. Comprobado el **efecto real** de las 4 con consecuencia: `anon` no puede ejecutar `reservar_numero_factura` ni `tiene_consentimiento_salud`, el default de `reserva_exigir_plan` está puesto y 0 estudios lo tienen mal, y el índice viejo de email ya no existe. **El registro miente en el nombre, no en el efecto.**
- **El 🔴 de ayer** (reembolso que bloqueaba reservar) está cerrado: la función de prod ya discrimina por `importe_devuelto` y el gemelo TS está en `main`. La única socia que quedaba en la lista se diagnostica ya como «no debe nada».
- **Crons e Inngest.** 26 funciones registradas, 17 jobs de pg_cron activos con la cadencia de su migración, 249/249 respuestas HTTP 200 con contadores de trabajo real, y método/secreto alineados 20/20. **Ninguna migración de cron se quedó sin aplicar.**
- **Idempotencia de notificaciones:** las 55 llamadas a `publish()` llevan `dedupKey` (verificado por parseo, no por grep).
- **Idempotencia de pagos:** tres capas independientes y correctas (`event.id`, compare-and-set con detección de segundo PI distinto, y el nonce firmado del TPV). `checkout.session.completed` y `payment_intent.succeeded` del mismo Bizum llegan los dos y **no** duplican.
- **Tenant del webhook:** ninguna rama se fía de `metadata.studioId`; todas resuelven por `studioDeCuentaConnect(event.account)` + `tenantAutorizado`.
- **#1755 factura de la alumna:** identidad del JWT, nunca del body; el recibo se filtra por `socio_id` **y** `studio_id`; recibo ajeno → 401 indistinguible de inexistente. Sin hallazgos.
- **#1754 productos físicos:** columnas explícitas, filtrado en SQL, no salen `stock`/`sku`/`iva_pct`, y no hay checkout que el navegador pueda manipular. Sin hallazgos.
- **Escritura optimista:** la familia **§1 no reaparece**. Revisados y correctos (revierten o escriben primero): `use-content-store` posts/likes, `student/domain/*`, `checkin`, `updateSesion`, `cambiarEstadoPlazaFijaPropia`, sustituciones, los 7 `tab-*` de configuración, `theme/*`, POS y checkout embebido.
- **`automation_logs` vacío desde julio** no es un dispatcher muerto: las 5 automatizaciones de prod están `activa=false`. Sin candidatas no hay log.

---

## MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida donde la he mirado; la separación servidor/cliente aguanta | Bajo | — |
| Frontend | Bien; el éxito falso es ya residual | Bajo | 4 |
| Backend | Bien; el webhook es el punto denso | Medio | 2 |
| Base de datos | Alineada con el código; el registro de migraciones deriva en nombres | Bajo | 5 |
| RLS / permisos | Cross-tenant cerrado; hoy se cierra la última escalada de rol | Bajo | — |
| Auth | Sin hallazgos esta pasada (no auditado a fondo) | No verificado | 3 |
| Pagos | **Bizum del mostrador recién abierto y sin red** | **Alto** | **1** |
| Reservas / Calendario | Correcto; los avisos ya no mienten | Bajo | — |
| Automatizaciones | Cadena completa y verificada contra prod | Bajo | — |
| Notificaciones | El canal email nunca funcionó; arreglado hoy, sin probar de punta a punta | Medio | 2 |
| Legal / facturación | Sello arreglado; el instante de aceptación sigue mal definido | Medio | 3 |
| UX | Preferencias de la socia divergen del catálogo | Medio | 3 |
| Rendimiento | No auditado esta pasada | No verificado | — |
| Tests | 4.158 pasando; el hueco está en *probar la forma*, no la función | Medio | 3 |
| Infraestructura | Crons y Inngest verificados vivos | Bajo | — |

## PLAN

1. **P-1 + P-2 + P-3 de una sola vez** — es todo el camino de Bizum del mostrador y arreglarlos sueltos deja medio caso abierto.
2. **Probar C-1 de punta a punta**: provocar un `TRIAL_PROXIMO_A_EXPIRAR` real y confirmar que Resend entrega. Hasta entonces el arreglo está probado en unidad, no en producción.
3. **P-4** (preferencias derivadas del catálogo) y **P-5** (la columna de Sentry).
4. Considerar que un `SKIPPED` sobre un aviso **CRÍTICA** cuente como fallo. Hoy es invisible por diseño y ese diseño es lo que ocultó C-1 durante toda la vida del motor.
5. **P-6** y **P-7** (limpiar comentarios que mienten: dirigen mal la siguiente auditoría).

---

## RESUMEN FINAL

**Encontrados:** 🔴 2 · 🟠 8 · 🟡 3
**Solucionados y verificados:** 8 (C-1, L-1, L-2, L-3, S-1, I-1, I-2, I-3, I-5)
**Pendientes:** 7 (P-1 a P-7), todos con causa y plan escritos
**Archivos modificados:** 14 (+582 / −49) · **Migraciones aplicadas a producción:** 1
**Tests:** 4.158 ejecutados, **4.158 pasan, 0 fallan** · **7 tests nuevos**
**Lint:** PASS (sobre los ficheros tocados)
**Typecheck:** **PARCIAL** — limpio sobre los 13 ficheros tocados y sobre los 44 que consumen los contratos que cambié de forma. **El typecheck completo NO se ha ejecutado**: tarda más que el límite de tiempo por comando de este entorno y no sobrevive en segundo plano. Hay que ejecutarlo antes de fusionar.
**Build / E2E:** **NO VERIFICADOS** (mismo límite de tiempo).

### Nivel de confianza

**Alto** en C-1, L-1, L-2 y S-1: los cuatro están medidos contra producción, no deducidos, y los tres primeros llevan tests que fallan si se revierten. **Alto** en S-1 además porque verifiqué en la propia BD que el camino del portal sigue pasando.

**Medio** en I-1: el recuento es correcto y los consumidores están verificados, pero **no he ejecutado la app**; el comportamiento del toast no lo he visto con mis ojos.

**Lo que NO puedo afirmar:** que el build pase, que los E2E pasen, que el typecheck completo esté limpio, ni que un email llegue de verdad a la bandeja de una propietaria. Y no puedo afirmar que no haya más problemas: he auditado a fondo notificaciones, automatizaciones, el camino del dinero reciente, la aceptación legal y los RPC de créditos. **No he auditado esta pasada** rendimiento, caché, theme builder, onboarding, ni el flujo de autenticación completo.

### Una cosa incómoda

Dos de mis seis arreglos iniciales estaban **mal**, y los checks estaban en verde con los dos rotos: uno no arreglaba nada (parcheé la capa que no envía) y otro rompía el typecheck en su consumidor. Los cazó la revisión independiente, no los tests. Es la tercera pasada seguida en que pasa lo mismo, y la conclusión es la misma: **en este proyecto un arreglo sin revisión adversarial tiene aproximadamente un tercio de probabilidad de no hacer lo que dice.**

### Sobre el despliegue

El árbol local de Marco estaba **21 commits por detrás** de `origin/main` al empezar, y `git merge` no puede ejecutarse desde aquí (el entorno bloquea borrados de ficheros). El parche va contra `f9fa8ec8`; **sincroniza antes de aplicarlo**:

```
git fetch origin && git reset --hard origin/main   # ⚠️ descarta cambios locales
git am audit-08sep.patch
npm run typecheck && npm test && npm run build
```

La migración de S-1 **ya está en producción**; el fichero del parche la deja registrada en el repo.
