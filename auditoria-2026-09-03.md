# Auditoría Tentare — 22ª pasada · 3 de septiembre de 2026

**Base auditada:** `origin/main` @ `5aa3f150` ("feat!: borrar el portal de la alumna (#1591)", subido hace 5 horas).
**Entrega:** rama `audit/2026-09-03` en tu repo local (2 commits) · parche `audit-03sep.patch`.
**Método:** 5 auditores en paralelo sobre un árbol limpio de `origin/main` + consultas a la BD de producción + Sentry, y después **2 revisores independientes** sobre el propio parche (que encontraron 7 fallos en mis fixes, 2 de ellos bloqueantes — ver §Revisión).

---

## ESTADO REAL DE TENTARE

* **Estado general:** el producto está sano en lo estructural (BD alineada con el repo, crons vivos, despliegue fluido, 3.431 tests). Lo que está roto hoy es **la consecuencia no medida de un borrado de 22.085 líneas que entró hace 5 horas**.
* **Riesgo técnico:** medio. No hay deuda estructural nueva; hay 47 enlaces vivos apuntando a código que ya no existe.
* **Riesgo de seguridad:** bajo-medio. Aislamiento entre estudios verificado con control positivo (una propietaria de `studio-demo` lee 6 socias propias y 0 filas de `studio-1` en socios, reservas, recibos, mandatos SEPA y condiciones de salud). Sin secretos en el bundle público (3,5 MB escaneados). Lo que queda son endurecimientos, no fugas.
* **Riesgo de datos:** **alto en un punto concreto**: la cadena Veri*Factu de `studio-1` está bifurcada desde el 10 de julio y nada lo detecta.
* **Riesgo de negocio:** **el más alto de la pasada.** Quien acaba de pagar aterrizaba en la pantalla de comprar. Y la alumna se ha quedado sin ninguna vía para ver su factura, cambiar su tarjeta, renovar su plan o dejar de recibir avisos.
* **Deuda técnica:** ~40 referencias muertas al portal, 7 funciones de `api-client.ts` sin llamante, 1 componente de 320 líneas inerte, 2 artículos de ayuda que describen pantallas borradas y 1 página de marketing indexada vendiendo un producto retirado.
* **Áreas más problemáticas:** (1) el apeo del portal, (2) facturación Veri*Factu, (3) el canal de notificaciones de la socia, (4) permisos de las RPC de bonos.

---

# 🔴 CRÍTICOS

### [P-1] Quien acaba de pagar aterriza en la pantalla de comprar

**Severidad:** 🔴 · **Área:** Pagos / UX · **Estado: ✅ SOLUCIONADO**

**Archivos:** `lib/billing/origen-pago.ts:63,67` · `app/portal/[slug]/[[...resto]]/route.ts` · `app/reservar/[slug]/page.tsx`

**Evidencia:** `urlsDeRetorno` componía `success_url = ${appUrl}/portal/${slug}/compras?pago=ok`. Esa ruta se borró el 3-sep y hoy es un `redirect()` a `/reservar/<slug>` que, además, **tiraba el query string entero** (`redirect(\`/reservar/${encodeURIComponent(slug)}\`)`, sin `req.nextUrl.search`).

**Qué ocurre:** la socia paga, Stripe la devuelve, la redirección se come `?pago=ok` y aterriza en la pantalla de reservar y **comprar**, sin una palabra sobre su pago. Es literalmente el bug que la cabecera de `origen-pago.ts` dice haber arreglado («la socia pagaba 175 € y aterrizaba en el login del panel de staff»), reintroducido por la puerta de al lado.

**Por qué ocurre:** el borrado del portal apeó las rutas pero no los orígenes que las componen. Los 7 asserts de `origen-pago.test.ts` pasaban en verde **fijando el contrato roto como correcto**.

**Impacto:** la socia no sabe si pagó → repite el pago o escribe al estudio. El mismo agujero afecta a guardar tarjeta (`?tarjeta=ok`) y a domiciliar por SEPA (`?sepa=ok`).

**Cambio aplicado:**
1. `origen-pago.ts` → `/reservar/<slug>?compra=ok|cancelada&plan=` y `?pago=ok|cancelado`, con `encodeURIComponent`.
2. La redirección **conserva la query** (`req.nextUrl.search`): cubre los enlaces ya sueltos por ahí (emails enviados, push entregados, PWA con bundle viejo) que no se pueden reescribir.
3. `setup-tarjeta` y `setup-sepa` apuntan a `/reservar/<slug>`.
4. `/reservar/[slug]/page.tsx` lee `?pago=`, `?tarjeta=` y `?sepa=` y pinta el aviso correspondiente.
5. Los 9 tests de `origen-pago` reescritos + **test nuevo que prohíbe que el retorno vuelva a apuntar a `/portal/`**.

**Riesgo residual:** el camino `origen:'portal'` **hoy no lo manda nadie** (el revisor lo comprobó: solo aparece en el test). El fix es un seguro para bundles/PWA cacheados. El camino **vivo de verdad** era `setup-tarjeta` (desde Cobros → "Pedir tarjeta a la socia").

---

### [P-2] Cancelar una clase siendo instructora no devolvía NINGÚN bono

**Severidad:** 🔴 · **Área:** Reservas / Dinero · **Estado: ✅ SOLUCIONADO**

**Archivos:** `lib/studio-context.tsx:2581` → RPC `devolver_sesion_bono` · endpoint nuevo `app/api/reservas/devolver-bonos/route.ts`

**Evidencia (cuerpo desplegado en prod, `pg_proc`, migración `20260902215304` de ayer):
```sql
if auth.uid() is not null and not public.puede_gestionar_calendario() then
  raise exception 'NO_AUTORIZADO';
```
Y `puede_gestionar_calendario()` = `current_rol() in ('PROPIETARIO','MANAGER','RECEPCION')` — **INSTRUCTOR fuera**. Pero el botón "Cancelar" del panel de sesión sí se le ofrece a la instructora en su propia clase (`esPropiaClase`, `calendario/page.tsx:2408`), y la RLS de `sesiones`/`reservas` se lo permite.

**Qué ocurre:** la instructora cancela → las socias pierden la plaza → **cada** devolución de bono revienta con `NO_AUTORIZADO`. El único aviso ("Revísalo a mano") lo ve ella, que es justo quien no puede arreglarlo (tocar `suscripciones` exige `puede_mover_dinero()`).

**Por qué ocurre:** el fix de ayer (P-3) razonó sobre quién *añade* reservas y no sobre quién *cancela clases*. Gemelo divergente, la causa dominante del repo por sexta pasada consecutiva.

**Impacto:** 3 instructoras con cuenta en prod, 10 estudios con `cancelacion_clase_devuelve_bono = true`, 25 suscripciones activas. **Puerta abierta desde el 2-sep 21:53; 0 daños materializados** (0 clases futuras canceladas por instructora desde entonces).

**Cambio aplicado:** la escritura sale del navegador (mismo criterio que cerró P-1 el 2-sep). Endpoint nuevo con service-role que:
* resuelve el estudio de la sesión de staff, **nunca del cuerpo**;
* replica la guardia de INSTRUCTOR de `/api/reservas/cancelar` (con service-role `auth.uid()` es NULL y la de la RPC quedaría bypaseada);
* exige reserva `CANCELADA`, **no `res-pf-`** (las plazas fijas nacen confirmadas sin consumir bono: devolverles saldo lo inventa) y **sesión `cancelada = true`** (ata la devolución a una cancelación real y evita que un POST repetido rellene bonos hasta el tope);
* comprueba la política `cancelacion_clase_devuelve_bono` **en servidor**, no solo en el navegador;
* **comprueba el `error` de las dos lecturas** (descartarlo convertía el endpoint en el mismo éxito falso que persigue esta pasada);
* devuelve saldos frescos y un recuento de fallos que distingue `SIN_BONO` (no es fallo) de `FALLO`.

**Riesgo residual:** un staff con permiso legítimo puede seguir llamando al endpoint con ids de reservas de una clase cancelada y subir el saldo hasta el tope del plan. Antes podía hacer exactamente lo mismo llamando a la RPC directa, así que no es una regresión — pero **no es idempotente y queda anotado** (ver PENDIENTES).

---

### [P-3] La cadena Veri*Factu de `studio-1` está bifurcada y nada lo detecta

**Severidad:** 🔴 · **Área:** Facturación / Cumplimiento · **Estado: ⚠️ PARCIALMENTE SOLUCIONADO**

**Evidencia (consulta sobre producción):**

| seq | número | `verifactu_prev_hash` | hash del anterior | ok |
|---|---|---|---|---|
| 3 | A-2026-0027 | `9F28A13A…` | `9F28A13A…` | ✔ |
| **4** | **A-2026-0028** | **`9F28A13A…`** | `10805856…` | **✘** |
| 5 | A-2026-0029 | `3CD20363…` | idem | ✔ |

Los dos registros que se bifurcan comparten `verifactu_ts` al segundo y prefijo de milisegundo en el id: dos sellados **concurrentes** de la misma acción del panel. **No ha vuelto a pasar desde el 10-jul** (seq 5→21 encadenan, incluidos 4 sellados en 3 segundos el 25-ago), así que la brecha de código parece cerrada por el bucle `CADENA_PENDIENTE`; lo que sigue vivo es el dato roto y **la ausencia total de detección** (`grep verifactu_prev_hash` → solo escrituras).

**Qué se ha hecho:** se ha cerrado la puerta contigua (ver [D-2] abajo). **La detección NO se ha implementado**: añadir un check de integridad de cadena al cron es una pieza nueva, no un arreglo, y toca cumplimiento fiscal. Queda propuesto:
```sql
select verifactu_seq, numero_completo,
       verifactu_prev_hash = lag(verifactu_hash) over (partition by studio_id order by verifactu_seq) as ok
from facturas where verifactu_seq is not null order by studio_id, verifactu_seq;
```
**Riesgo de no solucionarlo:** una factura emitida no se reescribe. Antes de poner `VERIFACTU_ENTORNO=produccion` hay que documentar la incidencia para el asesor fiscal.

---

### [P-4] La alumna ya no puede darse de baja de los avisos que sigue recibiendo

**Severidad:** 🔴 · **Área:** Notificaciones / RGPD · **Estado: ⏳ PENDIENTE (decisión de producto)**

**Evidencia:** la única UI que llama a `/api/notifications/preferences` es `components/notifications/notification-preferences.tsx`, montada **solo** en `app/(dashboard)/configuracion/notificaciones/page.tsx` (staff). La versión de la socia (`components/portal/portal-avisos-socia.tsx`) se borró. El email de aviso (`lib/notifications/channels.ts:100-121`) **no lleva enlace de baja**.

**Datos de prod:** 11 suscripciones push vivas (la última de ayer 22:43), 337 notificaciones, **87 avisos con deep link `/portal/…` solo en los últimos 7 días**, y 5 crons activos que los siguen generando.

**Por qué no lo he tocado:** montar la pantalla de preferencias en `/reservar` es funcionalidad nueva y hay que decidir dónde vive. **El mínimo viable inmediato sí es barato**: enlace de baja firmado al pie del email en `channels.ts` (ya existe `firmarBajaMarketing`).

---

# 🟠 IMPORTANTES

### [D-2] Sellar una factura legacy podía crear una SEGUNDA cabecera de cadena — ✅ SOLUCIONADO
`lib/billing/sellar-factura-server.ts:133`. La rama "retomar reserva incompleta" hacía `Number(existente.verifactu_seq)` y `?? ''`: con las **4 facturas anteriores a Veri*Factu que hay en prod** (`fac-1`…`fac-4`, seq NULL) eso da `seq 0` y prev-hash vacío, o sea "soy el primer registro". No alcanzable desde el panel (siempre manda id nuevo) pero sí desde el endpoint, que acepta el `id` del cuerpo. **Guarda añadida y verificada contra prod** (0 recibos pendientes de sellar → no bloquea ningún camino legítimo).

### [D-3] La rama POS del webhook era la ÚNICA que se fiaba de `metadata.studioId` — ✅ SOLUCIONADO
`app/api/stripe/webhook/route.ts:626`. Las otras nueve ramas resuelven el tenant desde `event.account`. Un estudio con su cuenta Connect podía crear un PI de 1 céntimo con `metadata:{origen:'pos_terminal', studioId:'<otro estudio>'}` y meter una fila fantasma en la caja ajena. Hoy `reconciliaciones_pos` tiene 0 filas y `/pos` está congelado. Cerrado copiando el patrón de la rama de al lado.

### [D-6/D-8/D-10/F-5] Familia "éxito falso": UPDATE sin `.select()` — ✅ SOLUCIONADO (5 sitios)
Un UPDATE de Supabase que no casa ninguna fila **no devuelve error**. Corregidos:
* `app/api/devoluciones/revertir/route.ts:118` — marcaba REVERTIDA sin haber escrito nada.
* `app/api/billing/webhook/route.ts:167,174` — el comentario de la línea 190 defendía el `.select('id')`… que solo existía en la tercera rama. Ahora las tres (y la que faltaba avisa a Sentry).
* `lib/billing/procesar-reembolso.ts:147` (`procesarDisputeCreated`) **y su gemelo `procesarDisputeClosed`** — este último lo cazó el revisor: es la rama en la que el dinero se va de verdad.
* `lib/supabase-data.ts:2545` (`dbUpdateReserva`) — único escritor de seis acciones del panel; en el check-in el éxito falso abre la puerta y dispara créditos y logros sobre una asistencia que la BD nunca registró.

### [D-9] El webhook de Connect trataba las suscripciones al propio SaaS como intento de fraude — ✅ SOLUCIONADO
Confirmado en Sentry (`JAVASCRIPT-NEXTJS-15`, 4 eventos, el último 23-ago 12:14:24, coincidente al segundo con el alta de un estudio). Era ruido con `level:'error'` en el canal del dinero de las socias. Ahora `mode:'subscription'` se ignora con 200. Verificado que **ningún** cobro de socia usa ese modo.

### [D-5] El resellado de facturas vivía detrás de un `return` temprano — ✅ SOLUCIONADO
`lib/inngest/conciliar-cobros.ts:486`. Si ningún estudio tiene Stripe conectado (7 de 10 hoy), el reintento de sellado no corría **aunque no dependa de Stripe**. Extraído a `reintentarSellado()`, verificado que no puede ejecutarse dos veces por pasada.

### [D-11] Un código de descuento del 100 % rompía el checkout embebido — ✅ SOLUCIONADO
`app/api/public/checkout-embebido/route.ts` validaba `importe > 0` **antes** del descuento; el gemelo `stripe/checkout` lo hace después. Ahora se revalida con un mensaje claro en vez de un 500 genérico.

### [F-4] `aceptar_oferta_lista_espera`: la última RPC de reservas con EXECUTE para `authenticated` — ✅ SOLUCIONADO (migración aplicada a prod)
Su consumo de bono vive en TS, no en la RPC, así que cualquier staff con JWT —incluida una INSTRUCTOR, el rol que P-3 fue a cerrar ayer— podía dejar una reserva CONFIRMADA **sin descontar sesión**. Migración `20260903132056` aplicada y verificada con control positivo: `authenticated=false`, `anon=false`, `service_role=true`.

### [F-9] "Eliminar clase" devolvía los bonos fire-and-forget — ⚠️ PARCIALMENTE SOLUCIONADO
`lib/studio-context.tsx:2641`. Su gemelo se arregló en la 20ª pasada y este se quedó. Ahora se espera y se avisa. **Lo que queda:** la lista de socias sale del estado del navegador, así que una reserva hecha hace 20 segundos y no cargada aún se pierde sin devolución y sin aviso. Arreglarlo requiere que `dbDeleteSesion` devuelva las confirmadas desde servidor.

### [S-1] `/api/auth/otp/reenviado` anula sin autenticación el cerrojo antifuerza-bruta del OTP — ⏳ PENDIENTE
`app/api/auth/otp/reenviado/route.ts:21`. Un POST con solo `{email}`, sin captcha ni JWT, borra el bucket `otp-verify-email:<email>` — el segundo cerrojo que existe precisamente porque gotrue solo limita por IP. Comprobado en vivo contra producción con una dirección `@example.invalid` (200 OK, sin tocar ningún dato real: los 7 buckets siguen intactos). **No lo he arreglado** porque la solución correcta —borrar el endpoint y limpiar el bucket dentro de `/api/auth/otp/verificar` cuando la verificación tiene éxito— toca el flujo de registro y no tenía cómo probarlo end-to-end. Agravante: `lib/rate-limit.ts` es fail-open.

### [E-1] 138 avisos de socia apuntan a una pantalla que ya no existe — ✅ SOLUCIONADO (los enlaces)
Los 18 deep links del rol SOCIA en `lib/notifications/catalog.ts` iban a `/portal/…`. Reapuntados a `/reservar/<slug>` con `?sesion=<id>` y `?tab=`, **con test guardián verificado por mutación** (reintroducir un `/portal/` hace fallar la suite). Lo que **no** arregla: `/reservar` no tiene mensajería, comunidad, documentos ni historial de compras — 54 avisos de comunidad en prod llevan a una pantalla real pero no a su contenido. Dejar de emitirlos hacia SOCIA es decisión de producto.

### [E-2] El canal EMAIL del motor de notificaciones no ha entregado un solo mensaje — ⏳ PENDIENTE
587 entregas en prod: 0 filas EMAIL, 0 WHATSAPP, 0 SMS. **7 de 10 estudios tienen `studios.email` NULL**, 6 de ellos activos. Los dos eventos `CRITICA` del catálogo (incluido "has dejado de cobrar") declaran los 4 canales y caen todos a SKIPPED — y `avisarFallos` excluye SKIPPED por diseño, así que **no hay ni un evento en Sentry**. Requiere decidir de dónde sale el email de contacto obligatorio.

### [E-5] WhatsApp comercial sin ningún mecanismo de baja — ✅ SOLUCIONADO
`lib/inngest/automatizaciones.ts:309`. El gemelo de email añade `unsubscribeUrl` en las dos ramas; este no llevaba nada. Añadido el mismo enlace firmado al final del mensaje. Hoy hay **0 automatizaciones activas en producción**, así que se cierra antes de que la primera dueña encienda una.

### [PORTAL-1..6] El apeo del portal, enlace a enlace — ✅ SOLUCIONADO
* El email de recibo llevaba un botón "Ver mi factura" a la pantalla de comprar → **botón retirado** (no queda ninguna ruta por la que una socia obtenga su factura; mejor sin botón que con uno que miente).
* `/reservar` decía "tus clases están en tu portal" con dos enlaces que **volvían a la misma página** (bucle), y uno prometía "crea tu contraseña", pantalla que ya no existe → sustituido por la pestaña **Mi cuenta**.
* El editor de temas del panel montaba un **404 dentro del marco de móvil** (`/portal-preview/<slug>` borrado); el mensaje del commit decía que "pierde" la previsualización → ahora lo dice de verdad, con un placeholder honesto.
* Configuración vendía la "App de tus alumnas" (instalable, con vídeos y progreso) y copiaba un enlace muerto → texto y enlace corregidos.
* Sidebar, Network alumna (×2) y el `redirectTo` del magic link de bienvenida, reapuntados.

### [S-2] `esClavePublicable` dejaba pasar una clave `rk_` al navegador — ✅ SOLUCIONADO
`lib/billing/modo-stripe.ts:69`. Una `rk_` es una clave **secreta** restringida, de servidor; el propio fichero ya la trataba así en `modoDeClave` (línea 42). Contradicción cerrada. **Verificado que hoy no está explotado**: escaneados los 33 scripts del bundle público de producción (3.525.916 bytes) → cero `sk_`, `rk_`, `whsec_` o `service_role`.

### [S-5] `mapInstructorPublico` era lista NEGRA alimentada por un `select('*')` — ✅ SOLUCIONADO
Convertida en lista blanca, como su vecina `studioPublico` (que lleva el comentario "lo que no se nombra aquí no llega al portal"). Que `tipo_contrato` no saliera al público era suerte, no diseño. Verificado por el revisor que no se pierde ningún campo que la página pública use.

### [S-6] Dos policies `anon USING (true)` sobre tablas de tenant — ✅ SOLUCIONADO (migración aplicada)
`contenido_portal` y `contenido_portal_banners`. Hoy eran letra muerta —comprobado con `has_table_privilege` y con `set local role anon` (42501)— pero basta pulsar "enable read access" en el panel de Supabase para publicar el contenido de todos los estudios. Borradas; las policies de staff intactas.

### [F-3] Borrar una socia no cancela sus reservas futuras — ⏳ PENDIENTE
`app/api/socios/eliminar/route.ts` no menciona `reservas`. Sus reservas siguen ocupando aforo para siempre, la lista de espera nunca se promociona y nadie recibe aviso. **8 socias borradas en prod, 0 con reservas futuras hoy.** No lo he tocado porque el orden importa (hay que cancelar **antes** de anonimizar o el aviso sale a nombre de "Socia eliminada") y toca un camino irreversible.

### [F-2] Promocionar de lista de espera se salta el límite semanal del plan — ⏳ PENDIENTE
`reservar_plaza` y `resolver_reserva_pendiente` aplican `limite_semanal`; sus dos gemelas que también producen una CONFIRMADA (`promocionar_siguiente_espera`, `aceptar_oferta_lista_espera`) no. 1 plan con `limite_semanal` en prod. Requiere extraer el bloque a una función SQL compartida y decidir qué hacer al saltar el cupo en la promoción (no se puede lanzar: revertiría la cancelación).

### [D-4] Un estudio sin `stripe_account_id` es un agujero negro — ⏳ PENDIENTE
Cuando `account.application.deauthorized` pone la cuenta a NULL (sin conservar el valor anterior en ninguna columna), todo evento de dinero de esa cuenta da 403 **y** el estudio desaparece de los tres conciliadores. Lo mismo al suspender un estudio por impago: deja de entregarse el dinero que sus socias ya pagaron. 7 de 10 estudios sin cuenta hoy, **ninguno con dinero atrapado**.

### [D-7] `dbSetStripeAccountId` se traga el error y el callback dice "Stripe conectado" igual — ⏳ PENDIENTE
Existe `uq_studios_stripe_account`: conectar una cuenta ya vinculada a otro estudio —el caso natural de una CADENA con varias sedes, y `studio-1` y `studio-2valj72pqysx` son plan CADENA— devuelve 23505 y deja la cuenta a NULL con la propietaria convencida de que ya cobra.

---

# 🟡 MEJORAS (seleccionadas)

* **[F-8] Dos comentarios afirmaban lo contrario de lo que hace el código desplegado** sobre si `promocionar_siguiente_espera` comprueba aforo — ✅ corregidos y verificados contra `pg_proc`: lo comprueba en la rama de promoción directa, **no** en la de oferta con plazo (y esa rama está viva: 2 tipos de clase con plazo > 0 en prod).
* **[E-6] La observabilidad de los crons dura 6 horas.** `net._http_response` se purga; `cron.job_run_details.succeeded` solo dice que la petición se encoló. Ningún cron escribe un log persistente. — ⏳ PENDIENTE.
* **[E-3] Ningún email transaccional deja rastro en la BD.** Si una dueña dice "mis alumnas no recibieron el aviso", solo se puede reconstruir si fue push o in-app. — ⏳ PENDIENTE.
* **[E-4] Twilio: `ok:true` significa "aceptado", no "entregado"** (sin `StatusCallback`), y hay **dos implementaciones divergentes de WhatsApp**: recordatorios usa la Cloud API de Meta con plantilla aprobada, marketing usa Twilio con texto libre — que Meta no entrega fuera de la ventana de 24 h, justo el caso de una reactivación. — ⏳ PENDIENTE.
* **[E-10] Tres triggers de marketing no comprueban `socio.activo`** (`SUSCRIPCION_CANCELADA`, `BONO_AGOTADO`, `BONO_QUEDA_1`) a diferencia de los otros cuatro. — ⏳ PENDIENTE **a propósito**: añadir el filtro podría silenciar una campaña de recuperación legítima. Es decisión de producto.
* **Código muerto tras el borrado:** 8 módulos `lib/portal-*` sin importadores, 7 funciones de `api-client.ts` sin llamante (incluidas `prepararRenovacionPlan`, `urlParaGuardarTarjeta` y `borrarTarjetaPublica` — las tres de dinero), variables CSS `--ap-*` sin definición consumidas por dos componentes de Comunidad, y `app/funcionalidades/app-para-alumnas` indexada vendiendo una PWA que ya no existe. — ⏳ PENDIENTE (limpieza, no urgencia).

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | El panel sigue escribiendo directo a la BD; es la raíz de P-2, F-9 y de los 3 fixes de ayer | Alto | **1** |
| Frontend | Sano salvo el apeo del portal (ya cerrado); `page.tsx` de `/reservar` con 3.800 líneas | Medio | 3 |
| Backend | 284 rutas, guardas consistentes; la familia "UPDATE sin `.select()`" cerrada en 5 sitios | Bajo | 4 |
| Base de datos | Repo y prod alineados; migraciones del repo todas aplicadas | Bajo | 5 |
| RLS | Aislamiento verificado con control positivo en 21 tablas; 2 policies muertas retiradas | Bajo | 5 |
| Auth | S-1 abierto (cerrojo OTP anulable sin autenticación) | Medio | **2** |
| Pagos | Retornos arreglados; Veri*Factu sin detección de cadena rota; D-4/D-7 abiertos | Alto | **1** |
| Reservas | P-2 cerrado; F-2 (cupo semanal) y F-3 (socia borrada) abiertos | Medio | 3 |
| Calendario | Sin sobreventa en prod (0 sesiones), sin dobles reservas, sin saldos negativos | Bajo | 5 |
| Automatizaciones | 0 activas en prod; 82 % del histórico son FALLIDO; WhatsApp sin plantilla aprobada | Medio | 3 |
| UX | La alumna ha perdido factura, tarjeta, renovación, mensajes y preferencias sin sustituto | Alto | **2** |
| Rendimiento | No auditado a fondo esta pasada | 🔎 | — |
| Seguridad | Sin secretos en cliente (verificado en el bundle real); endurecimientos pendientes | Bajo | 4 |
| Tests | 3.431 unitarios; **0 sobre las RPC de Postgres**, donde vive el dinero y el aforo | Alto | **2** |
| Infraestructura | Crons vivos (21.000 ejecuciones, 0 fallos); 3 crons de `vercel.json` no verificables desde aquí | Bajo | 4 |

---

# PLAN DE LIMPIEZA

**FASE 1 — CRÍTICOS (esta semana)**
1. Desplegar `audit/2026-09-03` (los retornos de dinero llevan 5 horas rotos en producción).
2. Enlace de baja al pie del email de avisos (`channels.ts`) — 5 líneas, cierra el flanco RGPD de P-4.
3. Check de integridad de la cadena Veri*Factu en el cron + documentar la incidencia del 10-jul.
4. Cerrar S-1 (borrar `/api/auth/otp/reenviado`, limpiar el bucket al verificar con éxito).

**FASE 2 — ESTABILIZACIÓN**
5. Rellenar `studios.email` en los 7 estudios sin contacto y hacer que un canal `CRITICA` en SKIPPED suba a Sentry.
6. F-3 (borrar socia cancela sus reservas) y D-7 (error real al conectar Stripe).
7. Decidir qué pasa con los avisos de comunidad/mensajes/documentos hacia SOCIA.

**FASE 3 — REFACTORIZACIÓN**
8. **Que el panel deje de escribir directo a la BD.** Es la raíz de P-2, F-9 y de tres de los cinco fixes de ayer. Seis pasadas seguidas con "gemelos divergentes" como causa dominante y ninguna la ha reducido; esto sí.
9. Unificar el límite semanal en una función SQL compartida por las cuatro RPC (F-2).

**FASE 4 — CALIDAD**
10. Tests sobre las RPC de Postgres (hoy 0) — es donde viven el dinero y el aforo.
11. Log persistente de crons y de emails transaccionales.

**FASE 5 — MEJORAS**
12. Limpieza del código muerto del portal y de la página de marketing indexada.

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Verificación | Estado |
|---|---|---|---|---|
| P-1 | Retorno de pago a la pantalla de comprar | `origen-pago.ts`, redirección, `setup-tarjeta`, `setup-sepa`, `page.tsx` | 9 tests reescritos + 1 nuevo de contrato | ✅ |
| P-2 | Instructora cancela y no se devuelve ningún bono | endpoint nuevo + `studio-context.tsx` + `supabase-data-admin.ts` | lint/tsc/3.430 tests; guardia comparada con su gemelo por el revisor | ✅ |
| D-2 | Segunda cabecera de cadena Veri*Factu | `sellar-factura-server.ts` | verificado contra prod (4 facturas legacy, 0 pendientes) | ✅ |
| D-3 | Tenant de la rama POS desde metadata | `stripe/webhook/route.ts` | lint/tsc; patrón idéntico al de la rama hermana | ✅ |
| D-5 | Resellado detrás de un `return` | `conciliar-cobros.ts` | revisor confirma que no corre dos veces | ✅ |
| D-6 | Devolución "REVERTIDA" sin escribir | `devoluciones/revertir/route.ts` | lint/tsc | ✅ |
| D-8 | Webhook de billing sin `.select('id')` (3 ramas) | `billing/webhook/route.ts` | lint/tsc | ✅ |
| D-9 | Suscripción SaaS tratada como fraude | `stripe/webhook/route.ts` | Sentry + grep de todos los `mode:'subscription'` | ✅ |
| D-10 | Disputa notificada sin registrar (**y su gemelo `Closed`**) | `procesar-reembolso.ts` | **test nuevo verificado por mutación** | ✅ |
| D-11 | Descuento del 100 % → 500 genérico | `checkout-embebido/route.ts` | lint/tsc | ✅ |
| F-4 | RPC de lista de espera abierta a `authenticated` | migración `20260903132056` | `has_function_privilege` + control positivo | ✅ |
| F-5 | `dbUpdateReserva` sin `.select()` (6 acciones) | `supabase-data.ts` | revisor comprueba los 6 llamantes: ninguna regresión | ✅ |
| F-8 | Comentarios que mienten sobre el aforo | `calendario-estado.ts`, `supabase-data-admin.ts` | `pg_proc` | ✅ |
| E-1 | 18 deep links al portal borrado | `catalog.ts` | **guardián verificado por mutación** | ✅ |
| E-5 | WhatsApp comercial sin baja | `automatizaciones.ts` | lint/tsc | ✅ |
| S-2 | `rk_` aceptada como clave de navegador | `modo-stripe.ts` + test | tests | ✅ |
| S-5 | Lista negra → lista blanca en instructoras | `supabase-data-admin.ts` | revisor: los 13 campos cubiertos | ✅ |
| S-6 | Policies `anon USING(true)` | migración `20260903132246` | `pg_policies` + grants | ✅ |
| PORTAL | 6 pantallas/enlaces al portal borrado | 6 ficheros | lint/tsc | ✅ |

## PROBLEMAS PARCIALMENTE SOLUCIONADOS

| ID | Qué se arregló | Qué queda |
|---|---|---|
| P-3 | La puerta que podía crear otra cadena rota (D-2) | La detección de cadenas rotas y el registro de la incidencia del 10-jul |
| F-9 | Se espera la devolución y se avisa si falla | La lista de socias sale del navegador: una reserva no cargada se pierde sin aviso |
| E-1 | Los 18 enlaces van a una pantalla real | `/reservar` no tiene mensajería, comunidad, documentos ni compras |

## PROBLEMAS PENDIENTES

| ID | Severidad | Por qué no se arregló |
|---|---|---|
| P-4 | 🔴 | La socia no puede desactivar avisos: montar esa pantalla es funcionalidad nueva |
| S-1 | 🟠 | Borrar el endpoint toca el flujo de registro y no pude probarlo end-to-end |
| E-2 | 🟠 | Requiere decidir de dónde sale el email de contacto obligatorio del estudio |
| F-2 | 🟠 | Refactor de 4 funciones SQL + decisión de qué hacer al saltar el cupo |
| F-3 | 🟠 | Camino irreversible; el orden aviso/anonimización hay que acordarlo |
| D-4 | 🟠 | Necesita columna nueva (`stripe_account_id_anterior`): cambio de modelo |
| D-7 | 🟠 | Cambia la firma de `dbSetStripeAccountId` y el contrato del callback |
| E-3/E-4/E-6 | 🟡 | Observabilidad: piezas nuevas, no arreglos |
| E-10 | 🟡 | Decisión de producto (podría silenciar campañas de recuperación) |

---

# REVISIÓN INDEPENDIENTE (lo que casi se entrega roto)

Dos revisores sobre el propio parche encontraron **7 fallos**, todos corregidos antes de esta entrega:

1. 🔴 El endpoint nuevo no copiaba el guard `res-pf-` de su gemelo → **inventaba saldo de bono** en plazas fijas (0 filas en prod, pero es el hallazgo abierto del 23-ago repetido).
2. 🟠 El endpoint descartaba el `error` de sus dos lecturas → éxito falso, exactamente la clase que esta pasada persigue.
3. 🟠 El endpoint dejaba la política del estudio solo en el navegador.
4. 🟠 **El gemelo de D-10 (`procesarDisputeClosed`) se quedó sin arreglar** — el fallo de gemelos cometido DENTRO del fix que lo combate.
5. 🟠 `router.replace` está medido como **no-op** en `/reservar`: la limpieza de la URL no limpiaba nada y los avisos de pago se quedaban pegados. Cambiado a History API en los tres efectos.
6. 🟠 El `ok:false` de la disputa no llegaba a Sentry (el 500 se descarta dentro de `after()`): se pasaba de éxito falso a silencio total.
7. 🟡 `export const HEAD = GET` era redundante (Next 16 lo implementa solo) y su justificación era falsa: **retirado**, porque un comentario falso es la premisa equivocada de la pasada siguiente.

Sexta pasada consecutiva en que la revisión independiente paga.

---

# RESUMEN FINAL

**Problemas encontrados inicialmente:** 🔴 4 · 🟠 19 · 🟡 14
**Solucionados durante la auditoría:** 19
**Parcialmente solucionados:** 3
**Pendientes:** 15
**No verificados (🔎):** 6 (build, los 3 crons de `vercel.json`, si hay tráfico real con `origen:'portal'`, el comportamiento de las PWA ya instaladas al cambiar el manifest, el evento de webhook clavado del 21-ago, y si `entregarPlanComprado` ha llegado a sellar alguna vez en prod)

**Archivos modificados:** 33 + 2 migraciones nuevas + 1 endpoint nuevo
**Tests ejecutados:** 3.431 · **nuevos:** 3 (2 verificados por mutación) · **fallidos:** 1
**Build:** ❌ NO VERIFICADO — el sandbox no alcanza `registry.npmjs.org` para descargar el binario SWC de linux-arm64 (`EAI_AGAIN`). Es del entorno, no del código.
**Typecheck:** ✅ PASS (único error: `nodemailer` no instalado en este `node_modules`; preexistente, también en el árbol intacto)
**Lint:** ✅ PASS (`eslint --max-warnings 0` sobre `lib`, `app` y `components` enteros)
**E2E:** NO DISPONIBLE (Playwright necesita navegador y servidor; además el commit de hoy borró 44 specs)

### ESTADO REAL POST-AUDITORÍA

Tentare llegó a esta pasada **mejor de lo que ha estado nunca en lo estructural**: la base de datos y el repo alineados, el despliegue fluido (la rama de ayer ya está en `main`), los crons con 21.000 ejecuciones sin un fallo, cero sobreventa, cero dobles reservas y cero saldos de bono negativos en producción.

Y aun así el riesgo más alto de hoy lo introdujo un commit de hace cinco horas. El borrado del portal fue una decisión de negocio razonable y está bien ejecutado en lo que borra; lo que no se midió es lo que **quedaba apuntando ahí**. Durante cinco horas, quien pagaba en Tentare volvía a la pantalla de comprar. Eso ya está cerrado, y además la redirección conserva la query, que es lo único que cubre los enlaces que ya no se pueden reescribir.

Lo que sigue abierto y no es código: **la alumna se ha quedado sin sitio**. No puede ver su factura, ni cambiar su tarjeta, ni renovar su plan, ni leer un mensaje del estudio, ni dejar de recibir avisos que se le siguen enviando. Eso último tiene un componente legal, no solo de UX.

**Nivel de confianza:** alto en lo que he tocado (typecheck, lint, 3.430 tests, dos revisores independientes que encontraron 7 fallos míos y una migración verificada con control positivo). Medio en lo que no: no he ejecutado el build, no he probado ningún flujo en un navegador real, y **la cobertura de tests sobre las RPC de Postgres sigue siendo cero** — y ahí es donde vive la lógica del dinero y del aforo.

**Antes de poner esto delante de cientos de estudios**, por orden: desplegar esta rama, dar a la alumna una salida para su factura y sus avisos, poner detección a la cadena Veri*Factu, y hacer que el panel deje de escribir directo a la base de datos. Ese último punto no es estética: seis pasadas seguidas con la misma causa dominante —arreglar un camino y olvidar su gemelo— y es la única que la cierra de raíz.
