# Auditoría — Marketing & Integrations Hub

Fecha: 2026-08-13. Punto de partida obligatorio antes de diseñar o programar
nada del "Marketing Hub" pedido (email marketing, SMS, automatizaciones,
segmentos, campañas, plantillas, integraciones externas tipo
Klaviyo/Brevo/Mailchimp). Cita siempre archivo/línea; si algo cambia,
corrige este documento en vez de dejarlo como ruido — mismo principio que
`.claude/tentare-os.md`.

## 0. Hallazgo que condiciona todo lo demás

**Tentare ya tiene un Marketing Hub construido, no un hueco vacío.**
Campañas, automatizaciones con flow-builder visual, canal SMS/WhatsApp,
patrón OAuth genérico y una categoría de notificación `marketing` ya
reservada en el esquema — todo existe en el código de este repo. Está
apagado a propósito:

```ts
// lib/feature-flags.ts
MARKETING_MODULE_ENABLED = false
// comentario explícito: "NO REACTIVES SIN QUE MARCOS LO DIGA"
```

Esto es una restricción más fuerte que el feature-freeze normal de
Kiosko/POS/VOD/Comunidad (`lib/frozen-features.ts`): tiene su propio
interruptor dedicado y cubre `/marketing` y `/contenido/*` enteros.
**Cualquier plan de trabajo tiene que empezar preguntando si se reactiva y
se construye ENCIMA de lo que hay, o si se descarta deliberadamente** — no
asumir ninguna de las dos.

## 1. Qué existe ya

**Módulo de Marketing/Campañas (congelado, no vacío)**
- `app/(dashboard)/marketing/page.tsx` (1668 líneas): Campañas +
  Automatizaciones + constructor visual de flujos
  (`components/marketing/flow-builder.tsx`), asistente IA de campañas
  (`app/api/ai/campana-asistente`).
- Tabla `campanas` (`supabase/migrations/0000_base.sql:410-427`): `tipo`
  EMAIL/WHATSAPP/SMS, `estado`
  BORRADOR/PROGRAMADA/ENVIADA/ACTIVA/PAUSADA, `destinatarios`, contadores
  `enviados`/`abiertos`/`clics`.
- Tabla `automatizaciones` (`0000_base.sql:378`, RLS
  `owner_automatizaciones`, solo PROPIETARIO): triggers de negocio
  (`lib/types.ts:993-1020` `TriggerAutomatizacion`:
  `SUSCRIPCION_EXPIRA_7D/1D`, `CUMPLEANOS`, `NUEVA_ALTA`,
  `INACTIVIDAD_30D`, `BONO_AGOTADO`, `BONO_QUEDA_1`, `CITA_RECORDATORIO`,
  `SUSCRIPCION_CANCELADA`, `PRIMERA_CLASE`), acción
  EMAIL/WHATSAPP/NOTIFICACION, constructor de flujos con pasos
  (`PasoFlujo`, `AccionFlujo`: EMAIL/TAREA/PUBLICAR_RED/NOTIFICAR_EQUIPO).
- Motor puro `lib/engines/marketing-automation-engine.ts`
  (`computeAutomatizacionMktCandidatos`), ejecutado por
  `lib/inngest/automatizaciones.ts` (comparte tabla `automation_logs` con
  `automatizacionId`).
- Entitlement de plan real: `lib/billing/entitlements.ts:16`
  `features.marketing: boolean`, solo planes ESTUDIO/CADENA
  (`PLAN_ENTITLEMENTS`), gate server-side vía
  `bloqueoPorFeature(studioId, 'marketing')`
  (`lib/billing/billing-guard.ts:36`), usado en
  `app/api/mensajes/send/route.ts:26`.

**Canal SMS/WhatsApp — ya encapsulado**
- `lib/twilio.ts`: `enviarMensajeTwilio`, `twilioConfigurado`, fail-soft
  si faltan env vars (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM/SMS_FROM`).
- `app/api/mensajes/send/route.ts`: único punto de entrada, solo
  PROPIETARIO, `enforceRateLimit` (20/60s), y comprueba que el
  destinatario sea de verdad socia de ESE estudio — el propio route
  documenta un bug de seguridad ya cerrado (envío libre a cualquier
  número).

**Envío de campañas — client-side, gap ya documentado en el propio código**
- `lib/studio-context.tsx:3625-3667` `enviarCampana()`:
  `mapLimit(destinatarias, 8, ...)` sobre `enviarEmailCampana`/
  `enviarMensajeCampana` (`lib/api-client.ts:1216`/`1277`, que sí pegan a
  `/api/emails/send` y `/api/mensajes/send` — el envío real es
  server-side, solo la orquestación vive en el navegador).
- Comentario propio (`lib/studio-context.tsx:3632-3634`): *"El fix
  definitivo a escala masiva es una cola en servidor."*
- `resolverDestinatariasCampana()`
  (`lib/studio-context.tsx:3606-3619`): segmentación son 6 valores fijos
  (`TipoCampana`/`DestinatariosCampana`, `lib/types.ts:962-964`:
  TODAS/ACTIVAS/INACTIVAS/SIN_PLAN/BONO/VIP; VIP = `s.tags?.includes('VIP')`).
  Sin motor de condiciones dinámico.
- `abiertos`/`clics` de `campanas`: solo se inicializan a 0 en
  `addCampana` (`lib/studio-context.tsx:3559,3583`) — sin tracking pixel
  ni webhook en ningún sitio del repo, columnas vestigiales.

**Notification Engine (event-driven)**
- `lib/notifications/catalog.ts`+`types.ts`: `EVENTOS`/`REGLAS`/
  `PLANTILLAS`, canal por evento como autoridad (`ReglaEvento.canales`),
  audiencias, 5 canales (`NotificationChannel`: INAPP/PUSH/EMAIL/
  WHATSAPP/SMS).
- `NotificationCategory` ya incluye `'marketing'`
  (`lib/notifications/types.ts:9`) y `CATEGORIAS_POR_ROL.SOCIA` la incluye
  (`catalog.ts:589`) — pero **ningún evento del catálogo usa
  `category: 'marketing'` hoy** (grep sin resultados en `REGLAS`).
  Categoría reservada, vacía.

**Emails — capa de abstracción real, no Resend suelto**
- `lib/emails/`: `*-template.tsx` (React Email) + `*-server.ts` por tipo,
  `send-server.ts` centraliza el cliente Resend, `resend-reintentos.ts`,
  `remitente.ts` (`remitentePorMarca()`), `dominios-reservados.ts`,
  `sanear-markdown.ts` (saneo XSS, #897), `plantillas-server.ts`/
  `plantillas-preview.ts` (personalización total del cuerpo).
- `app/api/emails/send/route.ts`: único endpoint que manda emails de
  automatización/campaña EMAIL.

**Integraciones OAuth — patrón ya reutilizable**
- `lib/oauth-state.ts`: `state` firmado HMAC (`OAUTH_STATE_SECRET`),
  stateless, TTL 10 min, `Provider = 'stripe' | 'google' | 'gmail' |
  'zoom'` — extender el union es literalmente añadir Klaviyo/Brevo/
  Mailchimp, el mecanismo nació de un bug CSRF real
  (`lib/oauth-state.ts:3-14`).
- Callbacks reales: `app/api/integrations/google-calendar/callback/`,
  `.../gmail/callback/`, `.../zoom/callback/`,
  `app/api/stripe/connect/callback/`.
- No hay tabla de tokens OAuth de terceros de marketing hoy — Google/Zoom/
  Gmail guardan tokens en columnas de `studios`/`instructores` según
  proveedor (confirmar por proveedor si se reutiliza el mismo patrón).

**Cron — híbrido confirmado**
- `lib/inngest/`: `automatizaciones.ts`, `recordatorios.ts`,
  `renovaciones.ts`, `decision.ts`, `dunning.ts`, `conciliar-cobros.ts`,
  `penalizaciones.ts`, `sustituciones.ts`, `valoraciones.ts`,
  `confirmacion-riesgo.ts`, `estudios.ts` — patrón fan-out probado
  (`enviarFanOutEnLotes`, `lib/inngest/client.ts`,
  `crons-cadencia.test.ts`/`crons-paginacion.test.ts`).
  Inngest ~84% del free tier en la última auditoría (ver memoria
  `inngest-limite-recordatorios-fan-out`).
- pg_cron ya asumió "bucket A"
  (`20260811133000_pg_cron_lista_espera_piloto.sql`,
  `20260811140000_pg_cron_bucket_a_resto.sql`). Cualquier cron nuevo de
  marketing compite por cuota con Inngest.

**Módulo Contenido (redes sociales) — dominio distinto, mismo interruptor**
- `app/(dashboard)/contenido/*` (calendario, biblioteca, ideas, métricas,
  carruseles, guiones IA): planificación de redes sociales, no email
  marketing. Vive bajo el mismo `MARKETING_MODULE_ENABLED` pero es negocio
  distinto.

**Roles/permisos**
- `/marketing` fuera de la lista blanca de INSTRUCTOR/RECEPCION/MANAGER
  (comentario en `app/api/mensajes/send/route.ts:9-11`) — solo
  PROPIETARIO.

## 2. Qué se puede reutilizar tal cual

- `lib/emails/send-server.ts` + `resend-reintentos.ts` + `remitente.ts`
  como `EmailProvider`: ya encapsulado, con reintentos y remitente por
  marca.
- `lib/oauth-state.ts`: extender el union `Provider`, no reinventar el
  `state`.
- `lib/twilio.ts` como patrón "provider externo gated por env vars,
  fail-soft" — mismo patrón para cualquier proveedor externo nuevo.
- `enforceRateLimit` (`lib/rate-limit.ts`) para cualquier endpoint nuevo
  de envío masivo.
- Notification Engine como motor de AVISOS internos (no de envío masivo):
  "tu campaña terminó de enviarse", "tu integración con Klaviyo se
  desconectó" — mismo patrón que `SISTEMA_STRIPE_DESCONECTADO`,
  reutilizando la categoría `marketing` ya reservada.
- `enviarFanOutEnLotes` y el patrón de paginación de
  `crons-paginacion.test.ts` para cualquier envío masivo server-side
  nuevo.
- `lib/billing/entitlements.ts` + `billing-guard.ts`: el gate de plan
  (`features.marketing`) ya existe y ya se aplica en al menos un endpoint.
- Patrón RLS `owner_automatizaciones` (solo PROPIETARIO, `studio_id =
  current_studio_id()`) como plantilla directa para tablas nuevas de
  campañas/segmentos/integraciones.

## 3. Qué está incompleto (TODOs/gotchas ya documentados en el propio código)

- Envío de campañas sin cola server-side (comentario explícito en
  `lib/studio-context.tsx:3632-3634`).
- `abiertos`/`clics` de `campanas` son columnas muertas, sin tracking real.
- Segmentación es una lista fija de 6 valores, no un motor de condiciones;
  `VIP` depende de un array de tags libre sin UI de gestión visible.
- **Dos motores de automatización solapados a propósito**:
  `INACTIVIDAD_30D` (marketing) vs `AUSENCIA_DIAS` (motor clásico,
  `lib/engines/automation-engine.ts`) — el propio código lo señala en la
  UI (`app/(dashboard)/marketing/page.tsx:64`) en vez de resolverlo.
- Sin unsubscribe/preferencias de marketing operativas — la categoría
  existe en el esquema pero ningún evento real la usa; no hay opt-out de
  campañas distinto de las preferencias de notificación in-app/push
  generales (esas no cubren base legal RGPD de email marketing masivo).
- Todo el módulo está detrás de `MARKETING_MODULE_ENABLED = false` —
  congelado deliberadamente, invisible en producción hoy.

## 4. Qué habría que modificar en sistemas existentes (sin romper lo que hay)

- `lib/oauth-state.ts`: ampliar el union `Provider` — revisar cualquier
  `switch` exhaustivo sobre `Provider` tras el cambio.
- `lib/notifications/catalog.ts`: eventos nuevos con `category:
  'marketing'` siguiendo el patrón de `SISTEMA_STRIPE_DESCONECTADO`.
- `lib/billing/entitlements.ts`: `features.marketing` es booleano
  todo-o-nada; si hace falta un límite cuantitativo (contactos/mes,
  campañas/mes) hace falta un campo numérico nuevo, no reutilizar el
  boolean.
- `enviarCampana` en `studio-context.tsx`: si se mueve a servidor, decidir
  entre el mismo god-file (`lib/db/supabase-data-admin.ts`, patrón
  server-only ya usado por 29 funciones) o un endpoint API nuevo — **no
  trocear `studio-context.tsx`**, decisión ya cerrada en este repo.
- `MARKETING_MODULE_ENABLED`: cualquier verificación visual en navegador
  del Marketing Hub queda bloqueada hasta que Marcos lo reactive
  explícitamente.

## 5. Qué habría que crear de cero

- Tabla(s) de tokens OAuth de proveedores de marketing (Klaviyo/Brevo/
  Mailchimp) con RLS por `studio_id`, patrón `owner_automatizaciones`.
- Motor de segmentos dinámico (condiciones sobre `socios`/
  `suscripciones`/`reservas`) si se quiere ir más allá de los 6 valores
  fijos — entidad nueva de verdad.
- Tracking de apertura/clic real, o aceptar que se delega al proveedor
  externo (Klaviyo/Brevo) y las columnas locales `abiertos`/`clics`
  quedan obsoletas.
- Cola/worker server-side de envío masivo (Inngest fan-out, mismo patrón
  que `enviarFanOutEnLotes`) para reemplazar el `mapLimit` cliente.
- Gestión de consentimiento/opt-out de marketing con base legal RGPD,
  distinta de las preferencias de notificación in-app actuales.
- UI de "Integraciones" en `/configuracion` — el deep-link
  `sistema.email_fallido` ya apunta a `/configuracion?tab=integraciones`
  pero esa pestaña no se encontró construida; verificar antes de asumir
  que existe.

## 6. Riesgos concretos de este repo

- **`MARKETING_MODULE_ENABLED = false` con "no reactivar sin que Marcos
  lo diga"** — riesgo #1, más fuerte que cualquier decisión cerrada de
  `tentare-os.md`. Cualquier trabajo queda invisible en producción hasta
  confirmación explícita.
- Cuota de Inngest (~84% en la última auditoría): pg_cron para trabajo
  determinista sin fan-out, Inngest solo si necesita reintentos/fan-out
  real.
- God files (`lib/supabase-data.ts`, `studio-context.tsx`): no trocear.
- RLS: cualquier tabla de tokens OAuth de terceros es tan sensible como
  `mandatos_sepa`/`instructor_tarifas` — aislar por fila.
- Gotcha de grants (ya pisado 4+ veces): cualquier RPC `SECURITY DEFINER`
  nueva para orquestar envío/consentimiento necesita `REVOKE ... FROM
  PUBLIC` + `GRANT` explícito + `has_function_privilege` verificado tras
  cualquier cambio de firma.
- Dos motores de automatización ya solapados
  (`automation-engine.ts`/`marketing-automation-engine.ts`) — un tercer
  motor sin dedup centralizado triplicaría el riesgo de mensajes
  duplicados a la misma socia.
- Coste real de mensajería: Twilio integrado y gated por credenciales,
  fail-soft hoy; activar el hub lo convierte en coste variable real y
  recurrente por estudio.

## 7. Dependencias/orden lógico de fases

1. **Decisión de producto explícita del fundador**: ¿se reactiva
   `MARKETING_MODULE_ENABLED` y se construye ENCIMA de las 1668 líneas de
   UI + motor existentes, o se descarta deliberadamente y se rehace?
   Bloqueante — determina todo lo que sigue.
2. Resolver el solape `INACTIVIDAD_30D`/`AUSENCIA_DIAS` antes de añadir
   un tercer motor de automatización.
3. Mover el envío de campañas del cliente a una cola server-side (Inngest
   fan-out) — requisito antes de escalar a listas grandes o a
   proveedores externos.
4. Diseñar el modelo de segmentos dinámico si hace falta ir más allá de
   los 6 valores fijos.
5. Integraciones OAuth con terceros (Klaviyo/Brevo/Mailchimp) — depende
   de (3): no tiene sentido sincronizar una lista externa si el envío
   interno sigue cliente-orquestado. Reutiliza `lib/oauth-state.ts`.
6. Tracking de apertura/clic — solo si se decide NO delegar en el
   proveedor externo.
7. Consentimiento/opt-out RGPD — transversal, debería ir antes o junto
   con cualquier envío masivo nuevo, no al final.

## 8. Costes potenciales a señalar

- SMS/WhatsApp vía Twilio: coste variable por mensaje, hoy opcional
  (`skipped` sin credenciales); activar el hub lo hace real y recurrente
  por estudio.
- OAuth de terceros (Klaviyo/Brevo/Mailchimp): coste de licencia de esas
  plataformas para el estudio final (o para Tentare si se centraliza),
  fuera del control de este repo.
- Cron adicional (sync de listas, envío programado): cuota de Inngest ya
  ajustada — evaluar cualquier fan-out por estudio contra el ~84%
  reportado antes de añadir un trigger recurrente nuevo.
- Resend: ya en uso, coste marginal por email adicional según volumen de
  campañas — sin límite conocido documentado en el repo.
