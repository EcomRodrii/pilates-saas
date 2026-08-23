# Auditoría Tentare — 22 de agosto de 2026 (14ª pasada)

**Árbol auditado:** `origin/main` en `83c883ce` (el código que está en producción).
**Base de comparación:** `1f77bd0c` (última pasada) → **56 commits nuevos**, 383 ficheros, +15.184/−2.495.
**Rama con las correcciones:** `audit/2026-08-22` (4 commits, 43 ficheros).
**Fuentes verificadas en vivo:** Supabase producción (`dwqvdycjcffqwfkzapvi`, solo lecturas), Sentry (org `tentare-software`, 7 días), `pg_get_functiondef`, `schema_migrations`, `cron.job_run_details`.

---

## ESTADO REAL DE TENTARE

**Estado general.** El código que se ha escrito esta semana es bueno: 56 commits, muchos de ellos cerrando hallazgos de auditorías previas, con comentarios que explican el porqué y con tests. La suite pasa de 3.163 a 3.317 tests. La CI está bien construida. Pero **el problema de esta pasada no es el código nuevo: es que el código correcto no llega a producción.**

**El hallazgo que ordena todo lo demás.** Los tres 🔴 del 21-ago —incluido uno de toma de control de cuenta— siguen abiertos en producción. La rama `audit/2026-08-21` nunca se fusionó. Y no es que se olvidara entera: **sus dos migraciones SÍ se aplicaron a producción** (`20260821130703` y `20260821130706`, confirmadas en `schema_migrations`) mientras el código se quedó fuera. Es decir, la base de datos avanzó y la aplicación no. En las mismas 24 horas se mergearon 56 commits de producto. La cola de despliegue funciona; lo que no funciona es la prioridad.

**Riesgo de seguridad: ALTO.** Dos agujeros explotables sin autenticación previa, ambos con fix escrito y revisado desde ayer:
- `/api/stripe/checkout` acepta `socioId` del cuerpo → escribir la compra a nombre de otra socia y **sobrescribir su método de pago guardado**, con lo que las renovaciones off-session cargan la tarjeta del atacante.
- `/widget-auth-retorno?origenEstudio=https://evil.com` entrega access + refresh token de la socia a cualquier origen → toma de control completa y persistente.
A eso se suma, nuevo de hoy, el mismo agujero en `setup-tarjeta`/`setup-sepa`.

**Riesgo de dinero: ALTO, y confirmado en Sentry, no deducido.** Tres issues vivos: la clave **secreta** de Stripe sigue llegando al navegador (`IntegrationError: You should not use your secret key with Stripe.js`, release del 19-ago) — el hallazgo del 20-ago **sigue sin rotarse**; el webhook de billing rechaza firmas desde hace 9 horas; y `StripeIdempotencyError` en el checkout embebido dejó a una invitada sin poder pagar.

**Riesgo de datos: MEDIO.** El aislamiento entre estudios aguanta y se verificó en vivo con JWT reales (una socia ve 0 filas de `socios`/`reservas`/`recibos`; una instructora ve 0 de los 7 recibos de su estudio). Lo que no aguanta es el aislamiento **por rol dentro del estudio**: una instructora puede acuñarse créditos canjeables por REST.

**Deuda técnica.** Estable, no creciente, con dos focos: `app/reservar/[slug]/page.tsx` (3.500 líneas, +633 esta semana, con el camino del dinero dentro del JSX) y la deriva entre el repositorio de migraciones y producción, que el propio check de deriva no puede ver.

**Áreas más problemáticas:** el proceso de despliegue de las correcciones de seguridad; Stripe (clave sin rotar); la familia «escritura optimista que no comprueba el resultado», que ha reaparecido en la UI nueva.

---

# 🔴 CRÍTICOS

### [C-1] Los tres 🔴 del 21-ago siguen vivos en producción; sus migraciones no

**Severidad:** 🔴 Crítico · **Área:** Proceso / Seguridad
**Evidencia:** `git merge-base --is-ancestor audit/2026-08-21 origin/main` → falso. En `origin/main`, `app/api/stripe/checkout/route.ts:97` sigue siendo `let socioId = body.socioId ?? null` sin ninguna verificación de JWT (el fichero no importa `verificarUsuarioSupabase`), y `app/widget-auth-retorno/page.tsx:33-47` sigue haciendo `postMessage({access_token, refresh_token}, origenEstudio)` con `origenEstudio` leído de la query string. En cambio, `select version from supabase_migrations.schema_migrations` devuelve `20260821130703_cupo_semanal_ignora_clases_canceladas` y `20260821130706_revoke_grants_tablas_medicion`: **las migraciones de esa misma rama sí están aplicadas.**
**Qué ocurre:** la mitad de base de datos de la auditoría del 21-ago está en producción y la mitad de código no.
**Impacto:** un atacante que conozca un `socioId` compra un plan a nombre ajeno y deja su tarjeta como método de cobro de esa socia. Una web cualquiera abre `tentare.app/widget-auth-retorno?origenEstudio=https://evil.com` en una pestaña y, si la visitante tiene sesión de socia, se lleva sus dos tokens.
**Cómo reproducirlo:** `POST /api/stripe/checkout` con `{studioId, planId, socioId:"<ajeno>"}` y sin cabecera `Authorization`.
**Solución:** aplicada — `audit/2026-08-22` los trae de vuelta por cherry-pick (`a8cd88e0`, `17fae32e`, `0233a094`), con el conflicto de `cancelarReservasDeSesiones` resuelto para que convivan con P-1.
**Riesgo de no solucionarlo:** cada día que pasa es un día más de ventana en dos vulnerabilidades cuya corrección ya está escrita y probada.

---

### [C-2] La clave SECRETA de Stripe sigue ejecutándose en el navegador

**Severidad:** 🔴 Crítico · **Área:** Pagos / Secretos
**Evidencia:** Sentry, issue `1P`: `IntegrationError: You should not use your secret key with Stripe.js`, en `/reservar/tentare`, frames `app:///dahlia/stripe.js` + `@stripe/stripe-js/dist/index.mjs:174`, release `361882dfa4fc` del 19-ago. No capturada.
**Qué ocurre:** es la confirmación **en tiempo de ejecución** de lo que la auditoría del 20-ago encontró estáticamente. La clave estuvo en un bundle público y **no consta que se haya rotado**.
**Impacto:** con `sk_live` cualquiera opera la cuenta de Stripe de la plataforma: cobrar, reembolsar, leer clientes.
**Solución recomendada:** rotar la clave en el Dashboard de Stripe **hoy**, actualizarla en Vercel y redesplegar. No es una corrección de código: no la puede hacer la auditoría.
**Estado:** ⏳ **PENDIENTE — requiere acceso al Dashboard de Stripe.**

---

### [C-3] Review Boost promete un 20% de descuento sin mirar si el servidor lo concedió

**Severidad:** 🔴 Crítico · **Área:** Growth / UX de errores
**Archivo:** `components/growth/review-boost-modal.tsx:48-55, 110, 121`
**Evidencia:** `enviarFeedback` devolvía `res.ok` y **ningún llamante leía el resultado**. Con 401/403/500 el modal pasaba igual a `pantalla='positivo'`, pintaba «20% de descuento reservado en tu cuenta» y marcaba `respondidoRef=true`; `cerrar(false)` escribía `reviewBoostMostradoEn` sin `pospuestoEn`, así que `debeMostrarModal` no vuelve a dar `true` jamás. Y sin `try/catch` alrededor del `fetch`, un fallo de red dejaba las cinco estrellas y el botón `disabled` para siempre, sin mensaje.
**Impacto:** feedback perdido de forma **irrecuperable** (la fila tiene `unique(studio_id)`: no hay segundo intento) y un descuento prometido que el checkout nunca encontrará en `review_boost_recompensas`.
**Solución:** ✅ aplicada — se lee el resultado, hay estado de error visible con `role="alert"`, `try/catch` en el `fetch`, y **409 se trata como éxito** (ya había feedback: el insert de un intento anterior cuajó).

---

### [C-4] «Entrar al panel» del onboarding podía ser un callejón sin salida

**Severidad:** 🔴 Crítico · **Área:** Onboarding
**Archivo:** `components/onboarding/pantalla-bienvenida.tsx:532-543`
**Evidencia:** `finalizar` ponía `guardadoRef.current = true` **antes** de escribir y descartaba el resultado de `updateStudio`, que no lanza: devuelve `{ok:false}`. La única salida de esta pantalla completa es `studio.bienvenidaVistaEn` truthy (`components/layout/dashboard-shell.tsx:190`).
**Impacto:** con el UPDATE fallando (RLS, JWT caducado, red), la propietaria queda **encerrada en el onboarding**: el botón no hace nada y el segundo clic sale por el `return`. Es la primera pantalla del producto.
**Solución:** ✅ aplicada — se comprueba el resultado, se libera el cerrojo para reintentar, se avisa por pantalla y se reporta a Sentry. El POST a `/api/onboarding/configurar` ahora también mira `res.ok`.

---

# 🟠 IMPORTANTES

### [I-1] Tres fallos del webhook de Stripe dejan muda la red de recuperación del dinero
`app/api/stripe/webhook/route.ts:942, 1267, 1284`. Los tres hacen `console.error` + `return 500` sin `Sentry.captureMessage`, a diferencia de todas las ramas vecinas. Pero el 200 **ya se envió** antes de entrar en `after()`: Stripe no reintenta. La de la línea 942 es la rama que existe para recoger `COBRADO_SIN_PERSISTIR`; si falla, el recibo se queda PENDIENTE, el dunning lo reintenta y a las ~24 h la clave de idempotencia de Stripe caduca → **segundo cargo real**. Es el escenario D-5 que esa misma rama iba a cerrar. ✅ **Aplicado:** los tres avisan a Sentry con `eventId` y qué hacer (reenviar el evento).

### [I-2] `setup-tarjeta` y `setup-sepa` dejan secuestrar el método de pago de una socia ajena
`app/api/stripe/setup-tarjeta/route.ts:68`, `app/api/stripe/setup-sepa/route.ts:56`. Solo validaban `socio.studio_id === body.studioId`; no había JWT. Con un `socioId` conocido, un tercero abre un Checkout `mode:'setup'` y el webhook (`webhook/route.ts:276-279`) escribe **su** `stripe_payment_method_id` sobre la ficha ajena. No mueve dinero al hacerlo: secuestra el instrumento con el que se cobrará después. ✅ **Aplicado:** nueva fuente única `lib/billing/socia-autorizada.ts` (staff del estudio, o la propia socia derivada de su JWT), usada por los dos gemelos. Comprobado uno a uno que los tres llamantes reales ya mandan JWT.

### [I-3] El descuento «solo para clientas nuevas» se regala a las de siempre
`app/api/public/checkout-embebido/route.ts:224` y `app/api/stripe/checkout/route.ts:173`: `esNueva: !socioId`. En el checkout embebido el JWT es **opcional**, así que basta con no mandar `socioId` y poner el propio email: el código de bienvenida se aplica, y después `entregarPlanComprado` localiza la ficha existente por `ilike(email)` y le apunta la compra. Descuento infinito. ✅ **Aplicado:** `lib/billing/socia-nueva.ts`, fuente única, fail-closed ante error de consulta, con los comodines de `ilike` escapados y 8 tests.

### [I-4] `resolver_reserva_pendiente` cuenta clases canceladas para el cupo semanal
`supabase/migrations/20260820162833_...sql:98-104`. Su cabecera afirma ser «copia literal del bloque de `reservar_plaza` vigente en producción». No lo es: le falta `and coalesce(ss.cancelada, false) = false`. **Verificado con `pg_get_functiondef` sobre producción el 22-ago:** `reservar_plaza` la tiene (se la puso la migración `20260821130703`), `resolver_reserva_pendiente` no. Al aprobar a mano una reserva, las plazas de clases que el propio estudio canceló gastan cupo → `LIMITE_SEMANAL` falso, o **una recuperación quemada sin avisar a nadie**. Hoy hay 7 reservas CONFIRMADA sobre sesiones canceladas en producción. ⚠️ **Migración escrita, NO aplicada** (`20260822090000_...`): tocar una función de reservas en caliente necesita despliegue, no una auditoría desatendida.

### [I-5] Deriva entre el repositorio de migraciones y producción, invisible para el check que existe para verla
`scripts/comprobar-deriva-migraciones.mjs:67` normaliza los nombres **quitando el prefijo de versión**, así que compara `studios_sitio_web` con `studios_sitio_web` y da verde aunque las versiones no coincidan. En producción: `studios_sitio_web` es `20260821012610` y en el repo `20260821101500`; `review_boost` es `20260821100754` y en el repo `20260821120000`. Un `supabase db push` desde un entorno limpio las trataría como migraciones no vistas → `add column` sin `if not exists` y `create table` ya existente → **push abortado**. ✅ **Parcialmente aplicado:** los dos ficheros renombrados a su versión real. ⏳ **Pendiente:** endurecer el script para comparar también la versión — no lo he tocado porque no puedo ejecutarlo contra producción desde aquí y un guardia a medias es peor que ninguno.

### [I-6] Una INSTRUCTORA puede acuñarse créditos canjeables
Policy en producción: `admin_credit_transactions`, `cmd=ALL`, expresión `(studio_id = current_studio_id())`, **sin comprobación de rol**. Probado con el JWT real de una instructora activa: `recibos=0, facturas=0, notas_internas=0` (la puerta financiera funciona) pero `credit_transactions=17`. `cmd=ALL` cubre INSERT: con su JWT y la anon key —pública por diseño— puede saltarse la API entera. Los créditos se canjean por recompensas (`reward_redemptions`): es dinero en especie. Mismo patrón en `reward_catalog`, `reward_rules`, `reward_history`, `member_credits`, `achievement_*`, `challenge_*`, e igual en `ingresos_manuales` (cuya propia ruta sí exige `puedeMoverDinero`, pero la RLS es el camino alternativo y ahí no hay puerta). ⏳ **PENDIENTE:** separar lectura de escritura y exigir rol es un cambio de policy sobre nueve tablas de gamificación; no sé sin ejecutar la app si la lectura la necesita alguna vista de instructora, y romper eso sería peor. SQL propuesto en la sección de pendientes.

### [I-7] `zoom-sync` puede crear una reunión nueva cada 15 minutos, para siempre
`lib/zoom.ts:151` devolvía `id: data.id ?? 0`, y **0 es falsy**: el guard del sincronizador es `if (!fila.zoom_meeting_id)`, así que una respuesta de Zoom sin `id` hacía que la siguiente pasada del cron volviera a crear la reunión. Y si `guardarReunion` fallaba, la reunión quedaba viva en Zoom sin apuntar. ✅ **Aplicado:** sin `id` es un fallo, no un éxito; y si no se puede persistir, se borra la reunión huérfana para que el reintento sea idempotente. (En producción hay 0 estudios con Zoom conectado: es un fallo latente, no observado.)

### [I-8] Mailchimp, Klaviyo y Gmail leen las socias sin paginar
`app/api/integrations/mailchimp/sync/route.ts:64`, `klaviyo/sync/route.ts:33`, `gmail/sync-contacts/route.ts:37`. El propio repo documenta que «sin paginar, PostgREST corta en 1000 filas EN SILENCIO». Mailchimp y Klaviyo sincronizaban las 1000 primeras y respondían `total: 1000` como si fuera todo. En Gmail es peor: esa lectura es la que **deduplica**, así que un estudio con más de 1000 socias re-importa duplicados. ✅ **Aplicado en los tres** con `fetchAllRows`, y ahora un fallo de página devuelve 502 en vez de mentir.

### [I-9] Los cuatro `error.tsx` nuevos no llegan a Sentry
`app/reservar/[slug]/error.tsx:16`, `app/portal/[slug]/error.tsx:15`, `app/(dashboard)/error.tsx:21`, `app/network/error.tsx:28`: solo `console.error`. Como el boundary de segmento **atrapa** el error, el `capturarExcepcion` de `app/global-error.tsx:24` ya no corre: un crash del widget público es invisible. ✅ **Aplicado**, una línea en cada uno.

### [I-10] Spinner infinito tras cobrar en `/reservar`
`app/reservar/[slug]/page.tsx:1367`. El efecto de polling hace `if (!pi || !email || !studioId) return` **después** de que `handlePagoExitoso` ya puso `confirmacionPago='confirmando'`, y el techo de ~35 s vive dentro de `preguntar`: quedaba «Estamos confirmando tu plaza» girando para siempre, con el cargo hecho. ✅ **Aplicado:** la decisión se toma en el manejador del evento (donde se sabe si hay algo que sondear), no en el efecto.

### [I-11] Cancelar una serie de clases devolvía `{ok:true}` sin mirar las reservas
`lib/studio-context.tsx:2629`. El camino de la clase suelta se arregló ayer; el de la serie se quedó llamando a `cancelarReservasDeSesiones` sin esperarla y devolviendo éxito. Es el mismo `{ok:true}` mentiroso que fabricó las 7 reservas fantasma que hay en producción. ✅ **Aplicado:** se espera y se propaga, conservando la devolución de bono de P-1.

### [I-12] `StripeIdempotencyError` en el checkout embebido — una invitada no pudo pagar
Sentry issue `1T`: `app/api/public/checkout-embebido/route.ts:353`, en `stripe.customers.create`, clave `checkout-embebido-v2-studio-1-plan-4-…:customer`, `invitada=true`. El comentario del propio código (líneas 348-352) dice que el `-v2` estrenaba espacio de claves limpio: **no bastó** — la misma clave se reutiliza con parámetros distintos. ⏳ **PENDIENTE:** hay que ver los dos intentos reales en Stripe para saber qué parámetro cambió; arreglar la clave a ciegas puede reintroducir el doble cobro que la clave existe para evitar.

### [I-13] El webhook de billing lleva 9 horas rechazando firmas
Sentry issue `1W`, release `e45f765c` (el fix de esta misma semana), tags `area=cobros`, `tipo=firma-no-verifica`, `secretoConfigurado=true`. El mensaje de Stripe apunta a que el cuerpo llega alterado («Are you passing the raw request body?»). ⏳ **PENDIENTE:** los eventos de suscripción del SaaS se están rechazando **ahora mismo**; el fix del 21-ago hizo visible el problema, no lo causó. Requiere comparar el `endpoint_secret` de Vercel con el del Dashboard.

### [I-14] `/reservar/[slug]/page.tsx`: 3.500 líneas y el camino del dinero dentro del JSX
Un solo componente con **48 `useState`, 13 `useEffect`, 22 `useMemo`, 9 `useRef`**, que creció 633 líneas esta semana, y con `fetch` a `/api/public/checkout-embebido` (:1311), `/api/public/estado-pago` (:1374) y `/api/stripe/checkout` (:1559) mezclados con la maquetación. `evaluarGate` (:1077-1128) y `planClaseSueltaPara` (:1070) son reglas de negocio puras —espejo del servidor— hoy **intestables sin renderizar 3.500 líneas**. ⏳ **PENDIENTE:** es una refactorización, no un fix. Las tres extracciones de más valor, por orden: `lib/reservar/gate.ts`, un `useFlujoReserva`, y `<HojaReserva>` (677 líneas).

### [I-15] La familia JWT caducado: 7 issues en Sentry, 1 usuario, decenas de peticiones muertas
Issues `1E`/`1F`/`1G`/`1H`/`1J`/`1K`/`1M`: `PGRST303 JWT expired` contra Supabase REST, y en `1G` además con `studio_id=eq.` **vacío** en las URLs. El commit `2f31974d` de esta semana dice recuperar la sesión sola; estos eventos son posteriores. ⏳ **PENDIENTE:** no he podido determinar si la recuperación no cubre este camino o si es un dispositivo concreto. Un usuario afectado.

---

# 🟡 MEJORAS

- **[M-1] `lib/iconos.ts` tiene cero importadores.** El «canon de iconos» del PR #1300 declara que «el código nuevo importa de aquí» y ni el código escrito después lo adoptó (Review Boost, onboarding y canales importan de `lucide-react` directo). O se adopta o se borra. ⏳ Pendiente: es una decisión de convención.
- **[M-2] `backups/create` no miraba el rol.** La RLS sí exige PROPIETARIO para leer, pero la ruta va con service-role. Una instructora podía crear copias en bucle y su poda se lleva por delante las copias manuales de la propietaria. ✅ Aplicado.
- **[M-3] Review Boost: la recompensa fallida solo iba a `console.error`.** Con `unique(studio_id)` no hay segunda oportunidad. ✅ Aplicado (Sentry con `studioId` y qué hacer).
- **[M-4] Zoom no limpia lo que deja de ser online.** Si la propietaria apaga el toggle, la reunión sigue viva y el recordatorio sigue enviando `zoom_join_url`. ⏳ Pendiente.
- **[M-5] Mailchimp: el opt-out no se propaga.** `lib/mailchimp.ts:63-82` solo hace `PUT` con `status_if_new`. Quien revoca el consentimiento en Tentare se queda suscrito en Mailchimp indefinidamente. ⏳ Pendiente: tiene aristas de RGPD y de producto (¿baja o archivado?), no es un fix mecánico.
- **[M-6] `role="dialog" aria-modal="true"` sin trampa de foco** en `components/reserva/reserva-calendario.tsx:1305`, mientras su hermano `components/ui/public-sheet.tsx:69` lo hace bien con `useDialogA11y`. ⏳ Pendiente.
- **[M-7] El badge «NUEVO» no existe en la barra inferior de móvil** (`components/layout/sidebar.tsx:97`), que es la navegación principal ahí. La feature entera es invisible en móvil. ⏳ Pendiente.
- **[M-8] «Continuar» del onboarding desactivado solo visualmente** (`opacity` + `pointerEvents:'none'`, sin `disabled` ni `aria-disabled`): sigue en el orden de tabulación. ⏳ Pendiente.
- **[M-9] Enter dispara dos veces en el onboarding** (`pantalla-bienvenida.tsx:666`, `pantallas-valor.tsx:149`): listeners globales sin filtrar `e.target`, así que Enter sobre un chip avanza y elige a la vez, saltándose una pregunta. ⏳ Pendiente.
- **[M-10] El directorio Network es legible por cualquier cuenta autenticada,** incluidas las socias de cualquier estudio (probado en vivo: una socia pura lee `red_perfiles`). Son datos que el directorio quiere enseñar, pero el permiso está una categoría de usuario por encima de lo necesario. ⏳ Pendiente.
- **[M-11] Dos catálogos de fuentes en la misma pantalla** (`lib/theme-schema.ts:29` y `lib/reservar/fuentes-catalogo.ts:45`). La separación técnica está justificada; lo que sobra es el `<select>` pelado de `theme-editor.tsx:968`. Fuente única para la UI: `SelectorFuente`. ⏳ Pendiente.
- **[M-12] `usuarios` es una tabla muerta con PII** (0 filas, un solo uso en el repo, policy `ALL` sin rol, columnas `email`/`telefono`/`rol`). No es explotable hoy; es una trampa esperando datos. ⏳ Pendiente: `drop table` merece confirmación.
- **[M-13] Zoom y Mailchimp no tienen ni un test.** Ni unitario ni e2e, siendo integraciones nuevas con red externa y un `pg_cron` detrás. Ninguna route de API tiene test en todo el repo. ⏳ Pendiente.
- **[M-14] `20260820182934_reembolso_fallido.sql:38`** hace `drop constraint` sin `if exists`: no es re-ejecutable. ⏳ Pendiente (ya aplicada).
- **[M-15] `refund.failed` y `charge.refund.updated` llegan los dos por el mismo hecho** y el segundo cae siempre en el fallback, disparando el warning `fila localizada por fallback` (`webhook/route.ts:1313`). Ruido garantizado en cada reembolso fallido. ⏳ Pendiente.

---

# MAPA DE DEUDA TÉCNICA

| Área | Estado | Riesgo | Prioridad |
|---|---|---|---|
| Arquitectura | Sólida donde se ha invertido; fuentes únicas reales (`booking-logic`, `descuento-checkout`, ahora `socia-autorizada`) | Bajo | — |
| Frontend | Bueno salvo `reservar/[slug]/page.tsx` (3.500 líneas, +633 esta semana) | Medio | 3 |
| Backend | Endpoints bien acotados; el patrón «gemelos con distinta validación» sigue apareciendo | Medio | 2 |
| Base de datos | Esquema coherente; **deriva repo↔prod real y no vista por el check** | Medio-alto | 2 |
| RLS | Aislamiento entre estudios verificado en vivo y correcto. **Aislamiento por rol: agujero en 9 tablas de gamificación** | Medio-alto | 2 |
| Auth | `current_studio_id()` anclada a pertenencia real, no a un claim. Invitaciones con token firmado y carrera cerrada | Bajo | — |
| Pagos | Idempotencia y derivación de importes correctas; **clave secreta sin rotar y webhook de billing rechazando firmas AHORA** | **Alto** | **1** |
| Reservas | Aforo atómico con `FOR UPDATE`, sin TOCTOU. Asimetrías entre caminos de cancelación | Medio | 3 |
| Calendario | Una sola zona horaria en TS y en SQL; sin mezcla UTC/local | Bajo | — |
| Automatizaciones | Zoom y Review Boost tienen ejecutor real y verificado (cron jobid 14, 143 ejecuciones, todas `succeeded`). Ninguna UI huérfana | Bajo | — |
| UX | La familia «escritura optimista que no comprueba el resultado» reapareció en la UI nueva | Medio | 3 |
| Rendimiento | Sin problema estructural detectado; el rAF perpetuo del onboarding es menor | Bajo | 5 |
| Seguridad | **Dos vulnerabilidades con fix escrito sin desplegar** | **Alto** | **1** |
| Tests | 3.317→3.329, CI bien construida; **cero cobertura en Zoom, Mailchimp y todas las rutas de API** | Medio | 4 |
| Infraestructura | CI sólida (guardia de tipos, 12 shards de e2e, check de deriva); el cuello está en qué se prioriza mergear | Medio | 1 |

---

# PLAN DE LIMPIEZA

**FASE 1 — HOY.** Rotar la clave secreta de Stripe [C-2]. Mergear `audit/2026-08-22` (trae [C-1] y 13 correcciones más). Arreglar el secreto del webhook de billing [I-13].

**FASE 2 — Esta semana.** Aplicar las dos migraciones de la rama [I-4] [I-6-parcial]. Decidir y aplicar las policies de gamificación [I-6]. Endurecer el check de deriva para comparar versiones [I-5]. Investigar `StripeIdempotencyError` con los dos intentos reales de Stripe [I-12].

**FASE 3 — Refactorización.** Trocear `reservar/[slug]/page.tsx` en tres piezas [I-14]. Consolidar el selector de fuentes [M-11]. Decidir sobre `lib/iconos.ts` [M-1] y `usuarios` [M-12].

**FASE 4 — Calidad.** Tests para Zoom, Mailchimp y las rutas de API de dinero [M-13]. Accesibilidad de la ficha de clase [M-6] y del onboarding [M-8] [M-9]. El badge NUEVO en móvil [M-7].

**FASE 5 — Mejoras.** Opt-out de Mailchimp [M-5], limpieza de Zoom [M-4], ruido de Sentry [M-15].

---

# REPARACIONES REALIZADAS

| ID | Problema | Archivo(s) | Solución | Verificación | Estado |
|---|---|---|---|---|---|
| C-1 | Los 3 🔴 del 21-ago sin fusionar | 20 ficheros (cherry-pick) | `a8cd88e0`+`17fae32e`+`0233a094`, conflicto de `cancelarReservasDeSesiones` resuelto para convivir con P-1 | tsc/lint/3.329 tests; verificado que `socioAutenticado` y `origenPermitido` están en el árbol final | ✅ |
| C-3 | Review Boost promete sin comprobar | `components/growth/review-boost-modal.tsx` | Se lee el resultado, estado de error con `role="alert"`, `try/catch`, 409 = éxito | tsc/lint/tests; revisión independiente | ✅ |
| C-4 | Onboarding sin salida | `components/onboarding/pantalla-bienvenida.tsx` | Se comprueba `{ok}`, se libera el cerrojo, aviso visible, Sentry | tsc/lint/tests | ✅ |
| I-1 | Webhook mudo en 3 ramas de dinero | `app/api/stripe/webhook/route.ts` | `Sentry.captureMessage` con `eventId` y qué hacer | tsc/lint/tests | ✅ |
| I-2 | Secuestro del método de pago | `setup-tarjeta`, `setup-sepa`, **nuevo** `lib/billing/socia-autorizada.ts` | Fuente única: staff del estudio o la propia socia por JWT | Comprobados los 3 llamantes reales uno a uno | ✅ |
| I-3 | Descuento de nuevas para las de siempre | `checkout-embebido`, `stripe/checkout`, **nuevo** `lib/billing/socia-nueva.ts` | Fuente única, fail-closed, comodines escapados | **8 tests nuevos** | ✅ |
| I-7 | Zoom crea reuniones en bucle | `lib/zoom.ts`, `lib/zoom-sync.ts` | Sin `id` es fallo; se borra la reunión huérfana | tsc/lint/tests | ✅ |
| I-8 | Tres sincronizaciones cortadas a 1000 filas | `mailchimp/sync`, `klaviyo/sync`, `gmail/sync-contacts` | `fetchAllRows` y 502 si una página falla | tsc/lint/tests | ✅ |
| I-9 | 4 `error.tsx` invisibles en Sentry | los 4 `error.tsx` | `capturarExcepcion` con `area` y `digest` | tsc/lint/tests | ✅ |
| I-10 | Spinner infinito tras cobrar | `app/reservar/[slug]/page.tsx` | La decisión se toma en el manejador, no en el efecto | tsc/lint (la primera versión fallaba `set-state-in-effect`) | ✅ |
| I-11 | Cancelar serie mentía con `{ok:true}` | `lib/studio-context.tsx` | Se espera y se propaga, conservando P-1 | tsc/lint/tests | ✅ |
| M-2 | `backups/create` sin rol | `app/api/backups/create/route.ts` | 403 si no es PROPIETARIO | Comprobado que la UI y el cron no se rompen | ✅ |
| M-3 | Recompensa fallida solo en consola | `app/api/growth/review-boost/feedback/route.ts` | `Sentry.captureException` | tsc/lint/tests | ✅ |

## PROBLEMAS PARCIALMENTE SOLUCIONADOS

| ID | Problema | Qué se arregló | Qué queda | Motivo |
|---|---|---|---|---|
| I-4 | Cupo semanal en la aprobación manual | Migración escrita y verificada contra el cuerpo vivo de producción | Aplicarla | Redefinir una función de reservas en caliente necesita despliegue, no una auditoría desatendida |
| I-5 | Deriva repo↔producción | Los 2 ficheros renombrados a su versión real | Endurecer `comprobar-deriva-migraciones.mjs` para comparar versiones | No puedo ejecutar el script contra producción desde aquí, y un guardia a medias es peor que ninguno |
| I-6 | Escalada de rol en gamificación | Migración de `revoke truncate/trigger/references` + `integraciones` sin `anon`, escrita y defensiva | Aplicarla, y decidir las policies de las 9 tablas | Cambiar `cmd=ALL` en 9 tablas sin ejecutar la app puede romper vistas de instructora |

## PROBLEMAS PENDIENTES

| ID | Problema | Sev. | Por qué no se arregló | Próximo paso |
|---|---|---|---|---|
| C-2 | Clave secreta de Stripe sin rotar | 🔴 | No es código: requiere el Dashboard de Stripe y Vercel | Rotar hoy |
| I-12 | `StripeIdempotencyError` en checkout embebido | 🟠 | Hay que ver los dos intentos reales en Stripe; a ciegas se reintroduce el doble cobro | Buscar `req_id6gMMMJLFFVzw` en el Dashboard |
| I-13 | Webhook de billing rechaza firmas | 🟠 | Requiere comparar secretos entre Vercel y Stripe | Comparar `endpoint_secret` |
| I-14 | `reservar/[slug]/page.tsx` (3.500 líneas) | 🟠 | Es refactorización, no corrección | `lib/reservar/gate.ts` primero |
| I-15 | Familia JWT caducado (7 issues) | 🟠 | No he podido determinar si la recuperación no cubre este camino | Reproducir con sesión caducada |
| M-1, M-4…M-15 | 14 mejoras | 🟡 | Convenciones, decisiones de producto o cambios sin urgencia | Ver Fases 3-5 |

---

# RESUMEN FINAL

**Problemas encontrados inicialmente:** 🔴 Críticos: 4 · 🟠 Importantes: 15 · 🟡 Mejoras: 15 · **Total: 34**
**Solucionados durante la auditoría:** 13
**Parcialmente solucionados:** 3
**Pendientes:** 18
**No verificados:** 6 (ver abajo)
**Archivos modificados:** 43 en `audit/2026-08-22` (23 propios + 20 del cherry-pick)
**Tests ejecutados:** 3.329 · **Tests nuevos creados:** 8 (`lib/billing/socia-nueva.test.ts`) + 4 del cherry-pick
**Tests fallidos:** 0
**Build:** NO VERIFICADO (el sandbox no tiene salida a `fonts.googleapis.com`; falla igual antes de mis cambios)
**Typecheck:** PASS · **Lint:** PASS (`--max-warnings 0`) · **E2E:** NO EJECUTADOS (requieren build)

### Revisión de mis propias correcciones

Siguiendo la lección del 20-ago (3 de 9 fixes rotos con todos los checks en verde), sometí el diff a una revisión independiente y escéptica. **Encontró 7 problemas, 4 de ellos reales y 2 que habrían roto producción:**

1. **Review Boost trataba el 409 como error** → el modal se habría quedado en rojo para siempre y reprogramado para reaparecer y fallar otra vez. Corregido.
2. **`esSociaNueva` era fail-open**: cualquier error de consulta regalaba el descuento, justo lo que la función existe para cerrar. Corregido, con test.
3. **Se paginó Mailchimp y se dejó Klaviyo y Gmail** igual de rotos — el mismo patrón de gemelo que esta rama dice combatir, cometido dentro del fix. Corregidos los tres.
4. **La migración de `revoke` se autoanulaba** (el default del proyecto vuelve a conceder los privilegios a cada tabla nueva) y podía abortar si alguna tabla no fuera del rol de migración. Reescrita con `alter default privileges` y un bucle que salta lo ajeno.
5. Un comentario mío afirmaba algo falso sobre los llamantes de `setup-sepa`. Corregido tras comprobarlos uno a uno.

Los otros 2 hallazgos eran falsos positivos del revisor, por leer un árbol desincronizado; verificados en el árbol real antes de descartarlos.

### Estado real post-auditoría

**Cómo estaba Tentare al empezar.** Con 56 commits nuevos de buena calidad y dos vulnerabilidades explotables abiertas, cuya corrección llevaba un día escrita, probada y sin fusionar — mientras las migraciones de esa misma rama sí se habían aplicado. La base de datos iba por delante del código.

**Qué se ha solucionado.** 13 problemas, incluidos los 3 🔴 heredados. Dos fuentes únicas nuevas donde había gemelos divergentes (`socia-autorizada`, `socia-nueva`). La red de recuperación del dinero ya no falla muda en las tres ramas donde lo hacía. Cuatro superficies de error que eran invisibles ahora llegan a Sentry.

**Qué sigue abierto, por orden de riesgo.** La clave secreta de Stripe sin rotar es hoy el mayor riesgo del producto y no se puede cerrar desde el código. El webhook de billing está rechazando firmas ahora mismo. Y una instructora puede acuñarse créditos canjeables.

**Qué NO he podido verificar:**
1. El **build** y los **e2e** (el sandbox no llega a `fonts.googleapis.com`).
2. Si el endpoint Connect de Stripe tiene suscritos `refund.failed`, `charge.refund.updated` y `charge.dispute.funds_reinstated`; si no, toda la red D-8 es código muerto.
3. Si la clave de Stripe se rotó tras el 20-ago.
4. El comportamiento real de Zoom: en producción hay **0 estudios conectados**, así que [I-7] es lectura de código, no observación.
5. La configuración de Auth (caducidad del magic link, MFA, redirect URLs) — no es consultable por SQL.
6. El `public/widget.js` realmente desplegado.

**Nivel de confianza.** Alto en lo que he tocado: cada corrección tiene evidencia, checks en verde y ha pasado una revisión adversarial que encontró errores reales en ella. Medio en el conjunto: he cubierto dinero, reservas, multi-tenancy, RLS, integraciones, widget público, frontend y CI, pero no he ejecutado la aplicación ni los e2e, y seis cosas quedan sin verificar. **No encontrar un problema en un área no significa que no lo haya.**

**Antes de poner Tentare delante de cientos de estudios:** rotar la clave de Stripe, fusionar esta rama, y establecer que **una corrección de seguridad no espera detrás de la cola de producto**. El patrón de las últimas cuatro pasadas ya no es técnico: el código correcto se escribe, y se queda en una rama.
