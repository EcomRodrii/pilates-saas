# Notification Engine (Tentare)

Sistema de notificaciones **centralizado y basado en eventos**. Cualquier acción
importante del producto **publica un evento**; el motor decide destinatarios,
prioridad, plantilla y canales. **Ningún módulo envía notificaciones
directamente.**

```
Acción de negocio
   └─ NotificationEngine.publish(evento)        (lib/notifications/engine.ts)
        └─ inngest.send('notification/emit')     (cola asíncrona, no bloquea el request)
             └─ worker procesarNotificacion       (lib/inngest/notifications.ts)
                  └─ procesarEvento()             (motor)
                       ├─ REGLAS[evento]          → categoría, prioridad, canales, audiencia
                       ├─ resolverDestinatarios() → propietaria / instructora / socia(s)
                       ├─ preferencias por usuario y categoría
                       ├─ plantilla por rol       → title/body/deep_link
                       ├─ fila `notification`     (in-app SIEMPRE, salvo preferencia/SILENCIOSA)
                       └─ `notification_delivery` por canal (INAPP, PUSH, …)
```

## Estado por fases

- **Fase 1a (este PR):** esquema, motor, bus Inngest, catálogo, resolución de
  destinatarios, canal in-app, canal push (stub), y el **primer evento cableado**
  de punta a punta: reserva → socia (confirmada/espera) + propietaria (nueva
  reserva). Verificado con tests de motor.
- **Fase 1b:** centros de notificación visibles (campana + bandeja) para los 3
  roles, API de lectura/marcado, preferencias y Notification Center (vista admin).
- **PR2:** Web Push real (Service Worker + VAPID + `push_subscription` + web-push).
- **PR3 (EN PROD):** canales EMAIL / WhatsApp / SMS implementados en
  `channels.ts` (email = Resend con marca del estudio; WhatsApp/SMS = `lib/twilio.ts`).
  Son **opt-in**: off por defecto en preferencias; se envían solo si el usuario
  los activa para esa categoría (las CRÍTICAS fuerzan todos los canales). Requieren
  env vars: `RESEND_API_KEY`/`RESEND_FROM` (email, ya en uso) y
  `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_WHATSAPP_FROM`/`TWILIO_SMS_FROM`
  (WhatsApp/SMS). Sin ellas → SKIPPED (no rompe). ⚠️ WhatsApp iniciado por el
  negocio fuera de la ventana de 24 h necesita **plantilla aprobada** en Twilio.
- **Automatizaciones (EN PROD):** `lib/inngest/notif-automations.ts` — 3 crons
  (dispatcher→fan-out por estudio→worker) que detectan condiciones y publican
  eventos: **recordatorio 24 h y 1 h** antes de la clase (cada 15 min),
  **bono a punto de caducar** (≤7 días, cada mañana) y **clienta inactiva**
  (30 días sin venir → aviso a la dueña, lunes). La **clase al 90 %** es
  event-driven (al reservar). Idempotentes por `dedup_key`.

## Tablas y relaciones (migración 0087)

| Tabla | Qué guarda | Relaciones |
|---|---|---|
| `notification` | La notificación **por destinatario** (rol, user, evento, categoría, prioridad, título, cuerpo, recurso, deep_link, data, leída/archivada, dedup_key). | `studio_id → studios`; `recipient_user_id → auth.users` (lógico). 1─N con `notification_delivery`. |
| `notification_delivery` | Un registro **por canal enviado** (status, attempts, error, provider_id, sent/delivered_at). Es el historial de entrega. | `notification_id → notification`; `studio_id → studios`. |
| `notification_preference` | Qué quiere recibir cada usuario **por categoría** y canal (inapp/push/email/whatsapp/sms). Ausencia de fila = valores por defecto (in-app+push ON). | `user_id → auth.users`; único por `(user_id, category)`. |
| `push_subscription` | Endpoints Web Push del usuario (endpoint, p256dh, auth). Los usa el canal PUSH (PR2). | `user_id → auth.users`; único por `endpoint`. |
| `notification_template` | Override de plantilla **por estudio** (o global si `studio_id` NULL). | `studio_id → studios`; único por `(studio_id, event_type, locale)`. |

**RLS:** cada quien lee lo suyo (`recipient_user_id = auth.uid()`); el staff del
estudio ve todo lo del estudio (Notification Center) vía `current_studio_id()`.
El motor escribe con **service-role** (salta RLS). Preferencias y suscripciones
las gobierna el propio usuario (`user_id = auth.uid()`).

## Prioridades

`CRITICA` · `ALTA` · `MEDIA` · `BAJA` · `SILENCIOSA`. Las **críticas ignoran las
preferencias** (siempre in-app + push): nunca se pierden. Las silenciosas se
registran pero no alertan.

## Cómo… (extender sin tocar la lógica de negocio)

### …añadir un nuevo tipo de notificación
1. En `lib/notifications/catalog.ts`: añade la clave a `EVENTOS`, su entrada en
   `REGLAS` (categoría, prioridad, canales, audiencia) y su(s) `PLANTILLAS`
   (`${evento}#${ROL}`).
2. Si la audiencia es nueva, añade un `case` en `resolverDestinatarios`
   (`lib/notifications/recipients.ts`).
3. Publica el evento donde ocurra la acción (ver abajo). Nada más.

### …añadir un nuevo canal (email/WhatsApp/SMS/telegram)
En `lib/notifications/channels.ts`, implementa `Canal` (envolviendo el wrapper
que ya existe: `lib/emails/send-server.ts`, `lib/twilio.ts`) y regístralo en
`CANALES`. El motor lo usará automáticamente para los eventos cuya regla lo
incluya y cuyo usuario lo tenga activado. **La lógica de negocio no cambia.**

### …crear/editar plantillas
Por defecto viven en `PLANTILLAS` (código, con variables `{clase}`, `{cuando}`,
`{socia}`, `{importe}`…). Para overrides por estudio, inserta en
`notification_template` (el motor puede preferir el override sobre el global).

### …crear automatizaciones (recordatorios, umbrales)
Añade una función cron de Inngest (patrón dispatcher→fan-out, como
`lib/inngest/renovaciones.ts`) que detecte la condición (24h antes, bono a punto
de caducar, 90% de aforo, 30 días sin asistir…) y llame a
`NotificationEngine.publish(evento)`. El motor se encarga del resto.

### …enviar una notificación desde CUALQUIER módulo
```ts
import { NotificationEngine } from '@/lib/notifications/engine';
// o un emisor de dominio de lib/notifications/emit.ts

await NotificationEngine.publish({
  type: 'reserva.confirmada',
  studioId,
  data: { clase, cuando, slug, sesionId, socioId },
  resource: { type: 'sesion', id: sesionId },
  dedupKey: `reserva:${sesionId}:${socioId}:CONFIRMADA`, // idempotencia
});
```
`publish` es **fire-and-forget**: encola en Inngest y nunca rompe el flujo de
negocio. En módulos que también se importan en el navegador (p. ej.
`lib/supabase-data.ts`), impórtalo **dinámicamente** (`await import(...)`) para no
arrastrar el motor al bundle de cliente.

## Rendimiento

El procesamiento va **fuera del request** (Inngest), con `concurrency` y
`retries`, e idempotencia por `dedup_key` (índice único parcial). Escala a miles
de notificaciones diarias sin bloquear reservas ni cobros.
