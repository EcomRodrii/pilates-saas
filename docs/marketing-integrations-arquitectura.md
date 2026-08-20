# Arquitectura propuesta — Marketing & Integrations Hub

Fecha: 2026-08-13. Depende de
[`docs/marketing-integrations-audit.md`](./marketing-integrations-audit.md)
— léelo primero, aquí no se repiten las citas de archivo/línea salvo que
aporten algo nuevo.

**Decisión del §8 paso 1 RESUELTA (2026-08-13) por Marcos**: reactivar y
extender el módulo existente. `MARKETING_MODULE_ENABLED = true` desde este
commit — las 1668 líneas de UI de campañas/automatizaciones/flow-builder
que existían son ahora visibles en producción, encima de todo lo reforzado
en los pasos 2-6 (dedup del solape de motores, Provider Layer, cola
server-side, consentimiento RGPD, segmentación ampliada).

## Principio rector

Tentare posee la lógica de marketing. Los proveedores externos
(Klaviyo/Brevo/Mailchimp/SMS) son intercambiables detrás de una capa fina.
Esto ya es parcialmente cierto en el repo — `lib/emails/`, `lib/twilio.ts`
y `lib/oauth-state.ts` son las tres piezas que YA encarnan ese principio.
No hay que inventarlo, hay que **generalizarlo** a más proveedores sin
romper lo que ya funciona.

## 1. Separación Marketing Engine / Provider Layer

**No son dos capas nuevas — son nombres para algo que ya existe partido en
tres sitios distintos**, y el primer trabajo de arquitectura real es
unificar la frontera, no crear una interfaz `EmailProvider` de la nada.

```
Marketing Engine (lógica de Tentare, ya existe parcialmente)
│
├── lib/engines/marketing-automation-engine.ts   (triggers → candidatos)
├── lib/engines/automation-engine.ts              (motor clásico — SOLAPA)
├── lib/studio-context.tsx: enviarCampana()       (orquestación, cliente)
└── lib/notifications/catalog.ts                  (eventos internos)

Provider Layer (ya encapsulado, falta generalizar el contrato)
│
├── lib/emails/send-server.ts        → Resend (ya es un EmailProvider de facto)
├── lib/twilio.ts                     → Twilio (ya es un SmsProvider de facto)
└── lib/oauth-state.ts                → mecanismo OAuth genérico (falta el "sync")
```

Lo que falta no es la separación conceptual — es que hoy **no hay una
interfaz formal**, cada provider expone su propia función con su propia
firma. Formalizar sin reescribir:

```ts
// lib/marketing/providers/tipos.ts (nuevo, fino, sin lógica)
interface EmailProvider {
  enviar(destinatario: string, contenido: EmailContenido): Promise<ResultadoEnvio>
  // implementación: lib/emails/send-server.ts ya hace esto, se envuelve, no se reescribe
}

interface SmsProvider {
  enviar(destinatario: string, texto: string): Promise<ResultadoEnvio>
  // implementación: lib/twilio.ts ya hace esto
}

interface IntegracionMarketing {
  conectar(studioId: string): Promise<void>       // usa lib/oauth-state.ts
  desconectar(studioId: string): Promise<void>
  sincronizar(studioId: string): Promise<ResultadoSync>
  manejarWebhook(payload: unknown, firma: string): Promise<void>
}
```

**Implementado (paso 3 del §8)**: `EmailProvider`/`SmsProvider` viven en
`lib/marketing/providers/tipos.ts`, con `resendEmailProvider()`
(`email-resend.ts`) y `twilioSmsProvider` (`sms-twilio.ts`) como
implementaciones — delegación fina sobre `conReintentoResend`/
`remitentePorMarca`/`enviarMensajeTwilio`, sin lógica nueva. Corrección
sobre el plan original: no se envolvió `lib/emails/send-server.ts` (ese
archivo es un helper de emails TRANSACCIONALES con plantillas fijas
—promoción/cancelación/recordatorio/reserva—, no el sitio real donde el
motor de automatizaciones manda su HTML genérico); el patrón real a
envolver era el que estaba **duplicado inline** en `procesarCandidato` y
`procesarCandidatoMkt` (`lib/inngest/automatizaciones.ts`), que ahora
llaman al provider en vez de a Resend/Twilio directo. `IntegracionMarketing`
queda sin implementar — es del paso 7 (Klaviyo), no de este.
Deliberadamente NO se migraron los otros 25+ call sites de Resend/Twilio
del repo (soporte, onboarding, valoraciones, notificaciones...): son
dominios de negocio distintos del Marketing Engine, fuera de alcance.

Estas interfaces son contratos TypeScript, no un framework de plugins —
coherente con "no over-engineer", el repo no necesita un registro dinámico
de providers, necesita que el código que hoy llama a `enviarMensajeTwilio`
directo pase a llamar a algo tipado como `SmsProvider`, para que el día
que haya un segundo proveedor SMS no haya que tocar cada call site.

## 2. Resolver el solape de motores ANTES de añadir nada

`marketing-automation-engine.ts` (`INACTIVIDAD_30D`) y
`automation-engine.ts` (`AUSENCIA_DIAS`) detectan la misma situación de
negocio con dos motores distintos, dos tablas de dedup distintas
(`automation_logs` compartida pero criterios de ventana propios de cada
uno), y el propio código en `app/(dashboard)/marketing/page.tsx:64` lo
reconoce en un comentario de UI en vez de resolverlo.

Añadir un tercer emisor de eventos (una integración externa que también
detecte "socia inactiva" y dispare su propio flujo) sin resolver esto
antes **triplica** el riesgo de que una socia reciba tres mensajes
distintos por el mismo motivo el mismo día.

Propuesta: antes de cualquier fase de integraciones, unificar en un único
punto de verdad: "socia inactiva" se detecta UNA vez (en el motor que ya
tenga el criterio más maduro — a decidir cuál de los dos, probablemente
`automation-engine.ts` por ser el genérico), y `marketing-automation-engine.ts`
pasa a ser un CONSUMIDOR de esa señal para decidir la acción de marketing
(email/SMS/WhatsApp), no un detector paralelo. Esto es refactor de
consolidación, no feature nueva — encaja en el paso 3 del "loop de
calidad" (`tentare-refactor`), con el veto de no trocear god-files
respetado porque no toca `studio-context.tsx` ni `supabase-data.ts`.

## 3. Modelo de datos — qué cambia y qué no

**No se toca**: `campanas`, `automatizaciones`, `automation_logs` — sus
columnas y RLS (`owner_automatizaciones`) siguen siendo la base. Se
extienden, no se reemplazan.

**Nuevo, mínimo, siguiendo el patrón `owner_automatizaciones` (RLS por
`studio_id`, solo PROPIETARIO)**:

```
integraciones_marketing            -- una fila por (studio_id, provider)
  studio_id
  provider              -- 'klaviyo' | 'brevo' | 'mailchimp' | futuros
  estado                -- 'conectada' | 'error' | 'desconectada'
  access_token_cifrado
  refresh_token_cifrado
  expires_at
  scopes
  metadata jsonb
  ultima_sincronizacion_en
  creado_en / actualizado_en

segmentos                          -- solo si se decide construir el builder (ver §4)
  studio_id
  nombre
  condiciones jsonb                -- árbol de condiciones, evaluado en TS, no en SQL dinámico
  creado_en / actualizado_en

sms_uso                            -- tracking de coste, ya previsto en el brief
  studio_id
  provider
  mensaje_id
  destinatario
  segmentos_sms         -- un SMS largo cuenta como varios "segments" de operador
  coste
  moneda
  estado
  creado_en
```

`integraciones_marketing` es la única tabla realmente nueva de alta
sensibilidad — mismo nivel que `mandatos_sepa`/`instructor_tarifas`: RLS
de fila, tokens SIEMPRE cifrados, nunca expuestos en un `SELECT *` de
amplio acceso. `sms_uso` es aditiva y de solo lectura para
PROPIETARIO/gerencia, análoga a `recibos`.

**Deliberadamente NO se crea**: una tabla de "eventos" nueva. El brief
pide un event bus (`student.created`, `booking.cancelled`, etc.) pero
`lib/notifications/catalog.ts` ya es ese event bus para el dominio interno
de Tentare — reutilizar su `EVENTOS`/`REGLAS`, extendiendo con
`category: 'marketing'` (ya reservada, hoy vacía) en vez de construir un
segundo sistema de eventos en paralelo. Si un evento de negocio no existe
todavía en el catálogo (p.ej. `bono.proximo_a_caducar` — parece no
existir hoy, verificar antes de asumir), se añade AHÍ, no en una tabla
nueva.

## 4. Segmentos — construir el builder, o no, es una decisión de alcance

El estado actual (6 valores fijos) cubre razonablemente el 80% de los
casos reales de un estudio pequeño. Un segment builder visual con árbol de
condiciones es trabajo real (UI + motor de evaluación + persistencia) y el
brief lo pide como "debe existir", pero el propio criterio del repo
(`tentare-producto`) exige preguntar si un estudio de Pilates real lo
necesita antes de construirlo, no asumirlo porque Klaviyo lo tiene.

Recomendación de secuencia: ampliar la lista fija con 3-4 valores más que
ya son computables con lo que hay (`bono próximo a caducar`, `pago
fallido`, `cumpleaños este mes` — todos ya existen como señales en algún
sitio del repo: Decision OS F3, `lib/decision/senales.ts`) ANTES de
construir un builder genérico. Si con eso no basta, entonces sí se
justifica el árbol de condiciones — pero como fase separada y explícita,
no bloqueante para el resto del Hub.

**Implementado (paso 6 del §8) — corrección sobre la propuesta original**:
las 3 señales nuevas (`BONO_CADUCA_PRONTO`/`PAGO_FALLIDO`/
`CUMPLE_ESTE_MES`, `lib/marketing/segmentos.ts`) NO reutilizan la lógica
exacta de F3 (`lib/decision/especialistas/finanzas.ts`) — esa calcula una
ventana ADAPTATIVA por ritmo real de asistencia de cada socia (necesita
`IndicesSenal` completo: frecuencia histórica, `planPorId`, `socioPorId`)
porque responde "avisa de ESTA socia concreta como insight accionable". Un
segmento de campaña responde una pregunta distinta ("quién entra en este
grupo para un envío masivo") y no necesita esa precisión — usa una ventana
FIJA de 14 días (el suelo mínimo que ya usa F3) y el mismo proxy simple
`sesionesRestantes !== null` que ya usan `BONO_AGOTADO`/`BONO_QUEDA_1` en
`marketing-automation-engine.ts` para distinguir bono-por-sesiones de plan
mensual, sin necesitar `planesTarifa`. `PAGO_FALLIDO` = algún recibo en
`estado = 'FALLIDO'`. `CUMPLE_ESTE_MES` = mismo mes que hoy (la
automatización `CUMPLEANOS` ya existente sigue comprobando el día exacto,
sirven propósitos distintos: aviso puntual vs. segmento para una campaña
del mes).

De paso, `recipientCount` en `marketing/page.tsx` — el recuento por
segmento que alimenta tanto el desplegable del formulario como el
asistente de IA — reimplementaba `resolverDestinatariasCampana` a mano
(divergencia real, no solo teórica: no aplicaba el filtro de
consentimiento que sí aplica `contarDestinatariasCampana` en
`studio-context.tsx`). Se sustituyó por una llamada al resolutor
compartido para las 9 opciones.

**Gotcha real encontrado al verificar**: las `<option>` del desplegable de
segmentos en el formulario de campaña están hardcodeadas aparte de
`destinatariosLabel` (el propio código ya lo advertía: "las `<option>` de
justo debajo SON el enum completo"). Añadir los 3 valores solo a
`DestinatariosCampana`/`destinatariosLabel` los habría dejado
seleccionables por la IA pero invisibles/inalcanzables en el formulario
manual — corregido añadiendo las 3 `<option>` que faltaban.

Sin builder de condiciones — con estas 9 señales fijas se cierra el paso
6 tal como estaba acotado; el árbol de condiciones genérico sigue fuera
de alcance salvo que se pida explícitamente.

## 5. Envío masivo — de cliente-orquestado a cola server-side

Esto es el prerequisito técnico real antes de cualquier integración
externa (si el envío interno sigue con `mapLimit(8)` en el navegador, no
tiene sentido sincronizar miles de contactos con Klaviyo para enviarles
algo que igualmente se manda desde el cliente).

Diseño: mover `enviarCampana` a un job Inngest con
`enviarFanOutEnLotes` (mismo patrón ya probado en
`crons-paginacion.test.ts`), disparado por un endpoint que solo encola
(`campanas.estado = 'ENVIANDO'`) y devuelve inmediato. Idempotencia por
`campana_id + destinatario_id` (evita el reenvío duplicado si el job se
reintenta — mismo principio que ya aplica el repo a webhooks de Stripe).

No es una cola nueva de infraestructura — es un `step.run` de Inngest más,
igual que los que ya existen. Cuota de Inngest: este job es
event-triggered (al enviar una campaña), no un cron recurrente, así que no
compite con el ~84% de cuota de la misma forma que un polling — pero sí
hay que medir el volumen real esperado (número de campañas/mes × tamaño
de destinatarios) antes de asumir que es gratis en cuota.

**Implementado (paso 4 del §8)**: `POST /api/marketing/campanas/[id]/enviar`
(solo PROPIETARIO, mismo gate `bloqueoPorFeature('marketing')` que el resto)
hace compare-and-set (`estado IN ('BORRADOR','PROGRAMADA') → 'ENVIANDO'`,
mismo criterio que `dbTransicionarRecomendacion` en
`app/api/decisiones/[id]/aprobar` — evita doble-encolar por doble clic o dos
pestañas) y dispara `EVENTS.CAMPANA_ENVIAR`. `lib/inngest/campanas.ts`
(`procesarEnvioCampana`) hace el envío real: un `step.run` por destinataria
(mismo patrón que `procesarEstudioAutomatizaciones`, NO
`enviarFanOutEnLotes` — esa es para fan-out ESTUDIO→estudio del dispatcher,
no destinataria-a-destinataria dentro de un estudio ya resuelto), usando el
`EmailProvider`/`SmsProvider` del paso 3. Idempotencia: `idempotencyKey`
de Resend (`campana-{id}-{socioId}`) + memoización del propio `step.run` en
Inngest (WhatsApp no tiene idempotency key nativo, mismo gap ya aceptado en
`procesarCandidatoMkt`). `resolverDestinatariasCampana` se extrajo a
`lib/marketing/segmentos.ts` (antes vivía solo en `studio-context.tsx`) para
que cliente (recuento inmediato) y servidor (envío real) usen el mismo
criterio sin poder divergir.

Migración `20260813115726_campanas_estado_enviando.sql` añade `'ENVIANDO'`
al CHECK de `campanas.estado`.

Decisión de UX explícita: **sin progreso en vivo**. La UI marca la campaña
ENVIANDO de inmediato (optimista) y muestra el recuento estimado
(calculado en cliente, datos ya en memoria); el recuento REAL
(`campanas.enviados`) lo escribe el job al terminar, pero la pestaña no lo
espera ni hace polling ni abre un canal Realtime nuevo — se ve al recargar.
Se descartó a propósito replicar el patrón Realtime de `instructores`
(`lib/studio-context.tsx`, canal + rotación de JWT) por ser más superficie
de la que pedía este paso; si se quiere progreso en vivo, es una fase
aparte a decidir explícitamente.

`enviarMensajeCampana` (`lib/api-client.ts`) quedó sin caller al mover el
envío de WhatsApp/SMS de campañas a `twilioSmsProvider` directo — se
retiró esa función, pero el endpoint `/api/mensajes/send` que usaba se
dejó intacto (queda sin caller también, pero es infraestructura completa y
auditada — no se retiró como efecto colateral de este cambio, es una
decisión aparte si se quiere).

## 6. Integraciones OAuth — Klaviyo/Brevo/Mailchimp

Diseño mínimo reutilizando lo que ya existe:

```
Propietaria → "Conectar Klaviyo" (UI en /configuracion, pestaña
  integraciones — verificar primero si esa pestaña existe, la auditoría
  no la encontró construida)
     ↓
GET /api/integrations/klaviyo/connect
  → genera state con lib/oauth-state.ts (extender union Provider)
     ↓
Login Klaviyo (BYO account de la propietaria, Tentare no crea cuentas)
     ↓
GET /api/integrations/klaviyo/callback
  → valida state, intercambia code por tokens, cifra, guarda en
    integraciones_marketing
     ↓
Sincronización (Inngest job, no cron recurrente — disparado por "Sincronizar
  ahora" o por evento local relevante, p.ej. alta de socia)
```

`manejarWebhook` de cada integración normaliza a los mismos eventos
internos que ya usa el Notification Engine
(`message.delivered`/`message.opened`/etc. como categoría `marketing`),
para que "esta campaña generó 8 reservas" (analítica del §26 del brief) se
pueda calcular igual venga el envío de Resend/Twilio o de un proveedor
externo — un solo modelo de analítica, no uno por proveedor.

**Implementado (paso 7 del §8) — correcciones sobre el diseño original**:

1. **No se creó `integraciones_marketing`.** Ya existía
   `integracion_credenciales` (studio_id, provider, access_token,
   refresh_token, expires_at) — la usan Google Calendar/Gmail/Zoom desde
   antes. Se le añadió una columna `metadata jsonb` (migración
   `20260813151635`) para lo que Klaviyo necesita y ningún proveedor
   anterior tenía: el id de la lista donde caen las socias sincronizadas.
   Reutilizar en vez de duplicar tabla.
2. **Sin cifrado de tokens.** El diseño original decía "guardar tokens
   cifrados" — al revisar el código, Google/Gmail/Zoom YA guardan sus
   tokens en TEXTO PLANO en `integracion_credenciales`, protegidos solo
   por RLS-sin-policies (deny-by-default, service-role únicamente, nunca
   alcanzable desde `anon`/`authenticated`). Klaviyo sigue el mismo
   patrón — introducir cifrado solo para un proveedor habría sido
   inconsistente sin arreglar los otros tres, y eso es un cambio de
   seguridad transversal aparte, no parte de este paso.
3. **PKCE, no solo `state` firmado.** Klaviyo bloquea el flujo OAuth sin
   PKCE desde 2025 (Google/Zoom no lo necesitan). `lib/oauth-state.ts`
   lleva el `code_verifier` DENTRO del propio state firmado — sigue
   siendo stateless, sin tabla de sesión nueva.
   `lib/marketing/pkce.ts` (`generarPkce`) es la única pieza de la
   integración con tests reales (RFC 7636: longitud, alfabeto, derivación
   SHA-256) — extraída aparte de `lib/klaviyo.ts` precisamente para que
   fuera testable sin arrastrar `lib/db/supabase-data-admin.ts` (un
   fichero enorme de imports `@/lib/...` de valor que `node --test` no
   resuelve, mismo gotcha ya documentado varias veces en este proyecto).
4. **Sincronización SÍNCRONA, no un job de Inngest.** El diseño original
   proponía un job de Inngest para la sincronización — pero
   `app/api/integrations/google-calendar/sync` (la única integración de
   sincronización que YA existe en este repo) lo hace síncrono dentro de
   la propia request. Seguir ese patrón evita un mecanismo nuevo para lo
   mismo; `app/api/integrations/klaviyo/sync` hace lo mismo, acotado por
   el límite real de la API de Klaviyo (1000 perfiles por lote).
5. **Guard de consentimiento aplicado también aquí.** La sincronización
   solo sube socias con `consentimiento_marketing_texto` vigente (mismo
   criterio exacto que campañas/automatizaciones, paso 5) — Klaviyo nunca
   debe recibir a nadie que no haya dado su consentimiento específico.
6. **`manejarWebhook`/analítica de aperturas y clics: NO construido.**
   Recibir webhooks de Klaviyo (opens/clicks) requiere que Klaviyo sepa
   la URL del endpoint — algo que se configura en el dashboard de
   Klaviyo, un paso manual de Marcos posterior a tener la app conectada.
   Queda para el paso 9 (analítica), no bloquea el connect/sync básico
   de este paso.

⚠️ **NO VERIFICADO end-to-end — bloqueante real, no una formalidad.**
Klaviyo exige que **Tentare** (la plataforma, no cada estudio) registre
una app OAuth propia en developers.klaviyo.com para obtener
`KLAVIYO_CLIENT_ID`/`KLAVIYO_CLIENT_SECRET` — algo que solo puede hacer
Marcos, con una cuenta de Klaviyo real. Sin esas credenciales:
- Las cards de Klaviyo en Configuración → Integraciones muestran
  "No disponible todavía" (mismo fail-soft que Google/Zoom sin sus
  respectivas env vars — no rompe nada, simplemente no aparece el botón
  de conectar).
- Ninguna llamada de este código ha hablado con la Klaviyo real. Los
  endpoints, headers y forma de cada request/response (`lib/klaviyo.ts`)
  salen de la documentación oficial de Klaviyo (developers.klaviyo.com),
  no de una prueba en vivo.
- Recomendado: probar el flujo completo (connect → sync con 2-3 socias de
  prueba → verificar en el dashboard de Klaviyo que llegaron con el
  consentimiento marcado) en un estudio de pruebas antes de anunciarlo a
  propietarias reales — mismo criterio que ya aplica este repo a Stripe
  Fase 3 ("construido, no probado con un cobro real").

## 7. Consentimiento — dónde vive, qué falta

Hoy: preferencias de notificación in-app/push (con categoría `marketing`
reservada) cubren el consentimiento de canales internos, pero no hay una
base legal RGPD específica para email marketing masivo (opt-in explícito,
registro de cuándo y cómo se dio, unsubscribe con link que no requiera
login). Esto es un requisito transversal, no una fase al final — cualquier
campaña de prueba/demo que se envíe durante el desarrollo debe respetar
esto desde el primer envío real, no retrofittearlo después.

Propuesta: extender el modelo de preferencias existente
(`lib/notifications/`) con un campo específico de "marketing por email"
distinto de las categorías in-app, con timestamp de consentimiento
explícito — mismo patrón que ya usa `AceptacionContrato.versionTexto`
para consentimiento de salud (comparar texto guardado vs texto actual en
vez de un esquema de versiones paralelo).

**Implementado (paso 5 del §8) — corrección sobre la propuesta original**:
NO se usó `notification_preference` (`user_id uuid NOT NULL` — exige cuenta
de `auth.users`; una campaña manda a `socio.email` directamente y muchas
socias con ficha nunca reclaman cuenta). Mismo sitio que
`consentimientoSalud` (art. 9 RGPD): tres columnas nuevas en `socios`
(migración `20260813122718`) — `consentimiento_marketing_en`/`_por`
(ligeras, en el select del panel) y `_texto` (el texto COMPLETO aceptado,
EXCLUIDO del select del panel a propósito — mismo ahorro de payload que
`aceptacion_version`, ver `FilaSocioPanel`). Texto propio en
`lib/legal-textos.ts` (`textoConsentimientoMarketing`), separado a
propósito de `textoLegalCompleto` — el art. 7.4 RGPD exige consentimiento
específico, no empaquetado con el contrato general.

`lib/marketing/consentimiento.ts`: `tieneConsentimientoMarketingVigente`
(comparación EXACTA de texto, la que de verdad decide un envío — exige que
el caller traiga `consentimiento_marketing_texto` con su propio select
targeted, mismo criterio que ya usa `lib/inngest/penalizaciones.ts` para
`AceptacionContrato`) y `tieneConsentimientoMarketingAlgunaVez`
(aproximación por presencia, la única que puede usar la UI — el panel no
trae el texto). El guard se aplicó en los dos sitios que de verdad envían:
`lib/inngest/campanas.ts` y `lib/engines/marketing-automation-engine.ts`
(`computeAutomatizacionMktCandidatos` gana `consentimientosMarketing`/
`textoConsentimientoVigente`; NOTIFICACION queda exento, no toca a la
socia). **Deliberadamente NO se tocó** `automation-engine.ts`/
`procesarCandidato` (motor clásico) — es un sistema distinto, anterior a
este Marketing Hub, y decidir si sus triggers (recordatorios, avisos de
pago) necesitan el mismo consentimiento específico es una pregunta de
producto/legal aparte, no una extensión mecánica de este paso.

Baja sin login: `lib/marketing/unsubscribe-token.ts` (HMAC sobre
studioId+socioId, reutiliza `OAUTH_STATE_SECRET` — SIN expiración a
propósito, a diferencia del `state` de OAuth de 10 min: un enlace de baja
dentro de un email tiene que seguir funcionando semanas después) +
`GET /api/marketing/baja` (público, HTML directo, revoca las tres
columnas). `AutomatizacionEmail` gana un `unsubscribeUrl` opcional (usa el
slot `pie` ya existente de `EmailLayout`) — presente solo en campañas y
automatizaciones de marketing, nunca en el resto de usos de esa plantilla.

**Fuera de alcance, documentado a propósito**: captura de consentimiento
solo desde el mostrador (`clientas/[id]/page.tsx`, `registradoPor:
'MOSTRADOR'` fijo) — no hay autoservicio desde el portal de la socia
todavía, sería una fase aparte. Opt-out de WhatsApp/SMS (palabra clave
STOP vía Twilio) no construido — el guard de consentimiento SÍ cubre
WHATSAPP en las automatizaciones de marketing (mismo texto que email,
art. 7.4 no distingue canal), pero el mecanismo de baja soportado hoy es
solo el enlace de email.

## 8. Orden de fases (reconciliado con el §7 del brief original y la
   auditoría — sin duplicar lo que ya existe)

1. ✅ **Decisión resuelta (2026-08-13, Marcos)**: reactivar y extender el
   módulo existente. `MARKETING_MODULE_ENABLED = true`.
2. ✅ Resolver solape de motores de automatización (§2) — refactor puro,
   sin UI nueva. PR #1015.
3. ✅ Formalizar `EmailProvider`/`SmsProvider` como interfaces sobre el
   código ya existente (§1) — sin cambiar comportamiento, solo el
   contrato.
4. ✅ Cola server-side de envío de campañas (§5) — prerequisito técnico de
   todo lo que sigue. Sin progreso en vivo (decisión de alcance, ver §5).
5. ✅ Consentimiento RGPD específico de marketing (§7) — transversal, antes
   de cualquier envío masivo real a producción. Motor clásico
   (`automation-engine.ts`) fuera de alcance a propósito.
6. ✅ Ampliar segmentación con señales ya existentes (§4) — 3 segmentos
   nuevos con ventana fija, no la adaptativa de Decision OS F3. Builder de
   condiciones sigue fuera de alcance salvo que se pida.
7. ⚠️ **Código completo, NO VERIFICADO** — flujo OAuth+PKCE, connect/
   callback/disconnect/sync (§6). Reutiliza `integracion_credenciales`
   existente, no una tabla nueva. Bloqueado para pruebas reales hasta que
   Marcos registre una app OAuth en developers.klaviyo.com y configure
   `KLAVIYO_CLIENT_ID`/`SECRET`.
8. ✅ **Mailchimp: NO es repetición del patrón (7).** Se intentó OAuth
   primero (mismo patrón que Klaviyo: app registrada en
   admin.mailchimp.com/account/oauth2, `MAILCHIMP_CLIENT_ID/SECRET` de
   plataforma, `integracion_credenciales`) — se registró la app real y se
   verificó en vivo, pero decisión explícita del usuario (2026-08-20) fue
   descartar ese camino: la propietaria prefiere pegar su propia clave API,
   sin depender de una app de plataforma. Reconstruido sobre el patrón
   Kisi/WhatsApp en su lugar: `campos` (`apiKey`/`audienceId`/
   `serverPrefix`) en `CATALOGO_INTEGRACIONES`, guardado en la tabla
   genérica `integraciones` (no en `integracion_credenciales`, que es solo
   para OAuth), auth Basic (`anystring:apiKey`) contra
   `https://{serverPrefix}.api.mailchimp.com/3.0`. Sin endpoint de bulk
   síncrono en la API de Mailchimp (el oficial es asíncrono con polling) —
   la sincronización hace un PUT idempotente por socia (`subscriber_hash`),
   aceptable para el volumen de un estudio. La columna
   `studios.mailchimp_account_name` (pensada para el "nombre de cuenta" que
   solo tiene sentido con OAuth) se creó y se revirtió en el mismo día —
   sin OAuth no hay nombre de cuenta que pintar.
   Brevo queda fuera de esta pieza a propósito: mismo motivo que llevó a
   descartar el OAuth de Mailchimp (Brevo tampoco ofrece registro OAuth
   self-service) — su integración, si se pide, sería el mismo patrón de
   API key ya construido aquí, no un caso nuevo.
9. Analítica de conversión (campaña → mensaje → reserva → ingreso) sobre
   el modelo de eventos ya unificado en (6 del audit)/(§6 aquí).

## 9. Lo que este documento NO decide

- Si se reactiva `MARKETING_MODULE_ENABLED`.
- Modelo comercial de SMS (incluido/créditos/pay-as-you-go/addon) — la
  tabla `sms_uso` (§3) es agnóstica a cualquiera de los cuatro, decisión
  de negocio aparte.
- Si Klaviyo es el primer proveedor a integrar o si se empieza por Brevo
  — orden de negocio, no técnico.
- Si el segment builder visual llega a construirse — condicionado a (§4).
