# Arquitectura propuesta — Marketing & Integrations Hub

Fecha: 2026-08-13. Depende de
[`docs/marketing-integrations-audit.md`](./marketing-integrations-audit.md)
— léelo primero, aquí no se repiten las citas de archivo/línea salvo que
aporten algo nuevo. `MARKETING_MODULE_ENABLED` sigue en `false` — nada de
lo implementado hasta ahora (pasos 2 y 3 del §8) depende de esa decisión ni
cambia UI visible del módulo de marketing en sí, son refactors/formalización
sobre código que ya corría. La decisión de si se reactiva el módulo
existente o se rehace queda pendiente y expresamente fuera de este
documento — lo que sigue es válido en cualquiera de los dos casos, porque
describe la forma final, no el punto de partida.

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

## 8. Orden de fases (reconciliado con el §7 del brief original y la
   auditoría — sin duplicar lo que ya existe)

1. **Decisión pendiente**: reactivar módulo existente vs rehacer (bloquea
   todo lo demás, fuera de este documento).
2. ✅ Resolver solape de motores de automatización (§2) — refactor puro,
   sin UI nueva. PR #1015.
3. ✅ Formalizar `EmailProvider`/`SmsProvider` como interfaces sobre el
   código ya existente (§1) — sin cambiar comportamiento, solo el
   contrato.
4. ✅ Cola server-side de envío de campañas (§5) — prerequisito técnico de
   todo lo que sigue. Sin progreso en vivo (decisión de alcance, ver §5).
5. Consentimiento RGPD específico de marketing (§7) — transversal, antes
   de cualquier envío masivo real a producción.
6. Ampliar segmentación con señales ya existentes; builder de condiciones
   solo si se justifica después (§4).
7. `integraciones_marketing` + flujo OAuth genérico extendido a Klaviyo
   (primer proveedor, el resto sigue el mismo patrón) (§6).
8. Brevo, Mailchimp — repetición del patrón de (7), no rediseño.
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
