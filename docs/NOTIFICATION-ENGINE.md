# Notification Engine (Tentare)

Sistema de notificaciones **centralizado y basado en eventos**. Cualquier acción
importante del producto **publica un evento**; el motor decide destinatarios,
prioridad, plantilla y canales.

⚠️ **"Ningún módulo envía notificaciones directamente" es el objetivo, no el
estado actual.** Hay envíos vivos fuera del motor, y hay que conocerlos antes de
añadir un canal a una regla o dar por hecho que apagar una preferencia silencia
algo — ver "Lo que NO pasa por el motor" al final.

```
Acción de negocio
   └─ publish(evento)                            (lib/notifications/engine.ts)
        │
        ├─ 1) crearInApp()  ── SÍNCRONO, en el propio request  (inapp.ts)
        │       ├─ REGLAS[evento]          → categoría, prioridad, canales, audiencia
        │       ├─ resolverDestinatarios() → propietaria / instructora / socia(s)
        │       └─ por destinatario:
        │            ├─ plantilla por rol   → title/body/deep_link
        │            │    (sin plantilla → se descarta AQUÍ, sin mirar preferencias)
        │            ├─ preferencias de ese usuario y categoría
        │            ├─ fila `notification`  (in-app SIEMPRE, salvo preferencia)
        │            └─ `notification_delivery` INAPP
        │
        └─ 2) POST /api/notifications/deliver  ── best-effort, timeout 10 s
             │    (SOLO si alguna fila creada tiene canales externos; la mayoría
             │     de eventos declara `canales: []` y nunca da este salto)
             └─ entregarExternos()          (process.ts → channels.ts)
                  └─ `notification_delivery` por canal (PUSH, EMAIL, WhatsApp, SMS)
```

⚠️ **No hay cola.** Esto fue un bus de Inngest (`notification/emit` → worker
`procesarNotificacion`) y **ya no lo es**: una cola invisible que fallaba en
silencio dejó producción sin ninguna notificación. Hoy la in-app se escribe con
un INSERT síncrono —si Inngest está caído o mal configurado, la campana se
entera igual— y los canales externos salen por un salto HTTP interno a una ruta
propia, aislada porque `process.ts` arrastra `web-push` → módulos de Node que no
pueden llegar al bundle de cliente.

Inngest **sigue en juego, pero un escalón más arriba**: los crons que DETECTAN
condiciones y publican eventos (ver "Automatizaciones"). Detectar es asíncrono;
entregar ya no.

## Estado por fases

- **Fase 1a:** esquema, motor, bus Inngest, catálogo, resolución de
  destinatarios, canal in-app, canal push (stub), y el **primer evento cableado**
  de punta a punta: reserva → socia (confirmada/espera) + propietaria (nueva
  reserva). Verificado con tests de motor. ⚠️ El **bus de Inngest de esta fase ya
  no existe** — ver el aviso del diagrama de arriba.
- **Fase 1b:** centros de notificación visibles (campana + bandeja) para los
  roles de entonces —hoy son 5: PROPIETARIO, INSTRUCTOR, RECEPCION, MANAGER,
  SOCIA—, API de lectura/marcado, preferencias y Notification Center (vista
  admin).
- **PR2:** Web Push real (Service Worker + VAPID + `push_subscription` + web-push).
- **PR3 (EN PROD):** canales EMAIL / WhatsApp / SMS implementados en
  `channels.ts` (email = Resend con marca del estudio; WhatsApp/SMS = `lib/twilio.ts`).
  Se envían **solo si la regla del evento los declara** (ver "Canales" abajo) y el
  usuario los tiene activados para esa categoría. ⚠️ Ojo, que esto es **opt-in y
  sin interruptor**: `PREF_DEFECTO` trae email/WhatsApp/SMS en `false` y la
  pantalla de preferencias solo pinta "En la app" y "Push", así que en la
  práctica hoy **solo las CRÍTICAS salen por esos canales** — el único evento
  no-crítico que declara EMAIL (`pago.disputado`) no manda nada salvo que alguien
  inserte la fila a mano por el PUT de preferencias. Requieren
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

## Tablas y relaciones (migración 0092 y posteriores)

| Tabla | Qué guarda | Relaciones |
|---|---|---|
| `notification` | La notificación **por destinatario** (rol, user, evento, categoría, prioridad, título, cuerpo, recurso, deep_link, data, leída/archivada, dedup_key). | `studio_id → studios`; `recipient_user_id → auth.users` (lógico). 1─N con `notification_delivery`. |
| `notification_delivery` | Un registro **por canal enviado** (status, attempts, error, provider_id, sent/delivered_at). Es el historial de entrega. | `notification_id → notification`; `studio_id → studios`. |
| `notification_preference` | Qué quiere recibir cada usuario **por categoría** y canal (inapp/push/email/whatsapp/sms). Ausencia de fila = `PREF_DEFECTO` (`inapp` y `push` ON; email/WhatsApp/SMS **OFF**). | `studio_id → studios` (su única FK; `user_id` es `uuid NOT NULL` pero **sin FK**); único por `(user_id, category)`. |
| `push_subscription` | Endpoints Web Push del usuario (endpoint, p256dh, auth). Los usa el canal PUSH (PR2). | `studio_id → studios` (su única FK; `user_id` es `uuid NOT NULL` pero **sin FK**); único por `endpoint`. |
| `notification_template` | Override de plantilla por estudio. **⚠️ Tabla muerta: ningún código la lee** (ver "…crear/editar plantillas"). | `studio_id → studios`; dos únicos parciales: `(studio_id, event_type, locale)` con estudio, y `(event_type, locale)` para el global. |

**RLS:** cada quien lee lo suyo (`recipient_user_id = auth.uid()`); el staff del
estudio ve todo lo del estudio (Notification Center) vía `current_studio_id()`.
El UPDATE es **solo del destinatario** (`20260729161500`): no existe ningún caso
de "marcar leída la notificación de otra persona". El motor escribe con
**service-role** (salta RLS). Preferencias y suscripciones las gobierna el propio
usuario (`user_id = auth.uid()`).

⚠️ **La RLS no puede ser la única cerradura aquí**, porque las rutas usan
service-role y ahí `auth.uid()` es NULL. Dos reglas viven por tanto en la API, y
hay que mantenerlas al añadir cualquier endpoint nuevo sobre `notification`:

- **Ámbito** (`lib/notifications/ambito.ts`): el centro se lee como `socia`
  (acotado a ese estudio y a `recipient_role = 'SOCIA'`) o como `staff` (todo lo
  que no sea de socia, sin acotar por sede: los avisos de otra sede de la cadena
  son suyos). Hace falta porque una misma persona puede ser staff **y** socia del
  mismo estudio con la misma cuenta — sin esto, el portal le enseñaba los avisos
  de su panel y el "marcar todo leído" de esa bandeja se los borraba de la
  campana. Se aplica en el GET **y en las cuatro acciones** del PATCH.
- **Rol y categoría** en el Notification Center (`/api/notifications/admin`): esa
  pantalla enseña el título y el CUERPO de cada aviso, así que no basta con
  exigir sesión de staff. `puedeVerCategoriaAvisos` deja fuera a INSTRUCTOR, y
  reserva `decisiones` a quien pueda ver `/centro-de-control` y `pagos` a quien
  pase `puedeVerFinanzas` — si no, la pantalla es una puerta de atrás a lo que
  `/cobros` y `/centro-de-control` ya le niegan a ese rol.

## Prioridades

`CRITICA` · `ALTA` · `MEDIA` · `BAJA` · `SILENCIOSA`. Las **críticas ignoran las
preferencias**: se envían por todos los canales que declara su regla, aunque el
usuario los tenga apagados (`inapp.ts`, `process.ts`).

⚠️ **`SILENCIOSA` no hace nada hoy.** El valor existe en el tipo y en el CHECK,
pero el motor solo trata distinto a `CRITICA`: una regla marcada `SILENCIOSA`
crearía su fila in-app normal y **dispararía PUSH** si su regla lo declara. Lo
que hace que hoy nada "alerte de más" no es la prioridad, es que ningún evento de
`REGLAS` usa ese valor. Si marcas uno nuevo como SILENCIOSA esperando que se
registre sin avisar, **impleméntalo primero**.

## Canales: la regla del evento es la autoridad

`REGLAS[evento].canales` es la **lista completa** de canales externos por los que
ese evento puede salir. A partir de ahí:

- La **preferencia del usuario solo puede quitar**, nunca añadir. Activar "email"
  en una categoría no hace que empiecen a llegar por correo eventos que no lo
  declaran.
- Una **CRÍTICA** salta la preferencia, pero tampoco se inventa canales: usa los
  declarados. Por eso las críticas declaran los suyos explícitamente.
- **No declarar = nunca.** No hace falta una lista de exclusiones: `sistema.email_fallido`
  simplemente no declara `EMAIL` (avisar por correo de que el correo falla se
  realimentaría).
- `canalesDisponibles(rol, categoría)` deriva de aquí qué interruptores tienen
  efecto para ese rol; la UI de preferencias lo usa para no ofrecer un canal que
  no haría nada.

⚠️ **Antes de añadir `EMAIL` a una regla, comprueba que el flujo no manda ya su
propio correo.** Varios lo hacen y duplicarlo es el error fácil: `clase.cancelada`
y `clase.modificada` (el panel escribe a cada alumna con plaza) y `pago.fallido`
(el dunning manda su primer aviso).

## Cómo… (extender sin tocar la lógica de negocio)

### …añadir un nuevo tipo de notificación
1. En `lib/notifications/catalog.ts`: añade la clave a `EVENTOS`, su entrada en
   `REGLAS` (categoría, prioridad, canales, audiencia) y su(s) `PLANTILLAS`
   (`${evento}#${ROL}`).
2. Si la audiencia es nueva, añade un `case` en `resolverDestinatarios`
   (`lib/notifications/recipients.ts`).
3. Publica el evento donde ocurra la acción (ver abajo). Nada más.

### …añadir un nuevo canal (email/WhatsApp/SMS/telegram)
En `lib/notifications/channels.ts`, implementa `Canal` y regístralo en `CANALES`.
WhatsApp/SMS envuelven `lib/twilio.ts`; el canal EMAIL **no** envuelve
`lib/emails/send-server.ts` —usa `resend` directo y construye su propio HTML—,
así que no lo tomes como plantilla sin mirarlo. El motor lo usará automáticamente para los eventos cuya regla lo
incluya y cuyo usuario lo tenga activado. **La lógica de negocio no cambia.**

### …crear/editar plantillas
Viven en `PLANTILLAS` (código, con variables `{clase}`, `{cuando}`, `{socia}`,
`{importe}`…), resueltas por `plantillaDe(evento, rol)` en `catalog.ts`.

⚠️ **`notification_template` no la lee nadie.** La tabla existe desde 0092 con su
RLS y sus grants, pero no hay un solo camino de ejecución que la consulte:
insertar una fila **no tiene ningún efecto**. Si algún día hacen falta overrides
por estudio, hay que implementarlos en `plantillaDe`. Ojo con la confusión: los
overrides de plantilla que **sí** funcionan son los de los emails
transaccionales, y son otra tabla (`plantillas_email`, vía
`lib/emails/plantillas-server.ts`), ajena a este motor.

### …crear automatizaciones (recordatorios, umbrales)
Añade una función cron de Inngest (patrón dispatcher→fan-out, como
`lib/inngest/renovaciones.ts`) que detecte la condición (24h antes, bono a punto
de caducar, 90% de aforo, 30 días sin asistir…) y llame a
`publish(evento)`. El motor se encarga del resto.

### …enviar una notificación desde CUALQUIER módulo
```ts
import { publish } from '@/lib/notifications/engine';
// o un emisor de dominio de lib/notifications/emit.ts

await publish({
  type: 'reserva.confirmada',
  studioId,
  data: { clase, cuando, slug, sesionId, socioId },
  resource: { type: 'sesion', id: sesionId },
  dedupKey: `reserva:${sesionId}:${socioId}:CONFIRMADA`, // idempotencia
});
```
`publish` **nunca propaga errores**: una notificación no puede tumbar una reserva
ni un cobro. Pero no es "fuego y olvido" del todo — **devuelve lo que se creó**
(`NotificacionCreada[]`, vacío si no se creó nada). Casi todas las llamadas lo
ignoran, pero cuando la dueña pulsa "Sí, avisar" hay que poder decirle a cuántas
personas se ha avisado **de verdad**, no a cuántas creía el panel.

En módulos que también se importan en el navegador, impórtalo **dinámicamente**
(`await import(...)`) para no arrastrar el motor al bundle de cliente — es lo que
hace `lib/db/supabase-data-admin.ts` en todas sus emisiones.

## Rendimiento

La in-app se escribe **dentro del request**: es un INSERT, y es a propósito
(garantía > latencia, ver el aviso del diagrama). Lo que no bloquea es la entrega
de canales externos — sale por un salto HTTP con `AbortSignal.timeout(10_000)`,
así que un push lento nunca alarga una reserva ni un cobro, y si falla la in-app
ya está escrita.

La idempotencia la da `dedup_key` (índice único parcial `uq_notification_dedup`),
no la cola: reprocesar el mismo hecho no duplica.

⚠️ La clave lleva la identidad del destinatario **y, si hace falta desempatar, su
bandeja** — una misma persona puede ser staff Y socia del mismo estudio con la
misma cuenta, y necesita una fila en cada centro. Ver `claveDedup` en `inapp.ts`
antes de tocar la forma de una `dedup_key`: **cambiarla es un cambio de
comportamiento, no un refactor**, porque hay familias de claves cuya ventana dura
un mes (`inactiva:…:${mes}`, con cron semanal) o un día (`decision-mensaje-dia`).

## Lo que NO pasa por el motor

La cabecera dice que ningún módulo envía por su cuenta. Es la intención, y hoy
tiene excepciones vivas. Antes de añadir `EMAIL` a una regla o de prometerle a
alguien que un interruptor silencia algo, mira si su flujo ya está aquí:

- **Recordatorio de clase, 24 h — hay DOS, por vías distintas.** El del motor
  (`notif-automations.ts`, cron `*/15`, in-app + push) y otro completamente
  aparte: `lib/inngest/recordatorios.ts` (cron `0 8 * * *`) →
  `enviarRecordatoriosClasesProximas` (`lib/db/supabase-data-admin.ts`), que
  manda **email y WhatsApp** directos, sin pasar por `publish()`. Registrado en
  producción (`app/api/inngest/route.ts`).
  ⚠️ Y se gobierna con **otro sistema de preferencias**:
  `preferencias_socio.notif_email` / `notif_whatsapp` y la exención
  `socio_excepciones` tipo `SIN_RECORDATORIO` — nada de eso es
  `notification_preference`. Apagar "reservas" en el centro de preferencias **no**
  silencia ese correo.
- **Los tres correos del aviso de más arriba**: `clase.cancelada`
  (`enviarEmailCancelacionClase`, desde el calendario y `studio-context`),
  `clase.modificada` (`enviarEmailesCambioClase`, en la ruta
  `avisar-cambio-clase`) y `pago.fallido` (`enviarEmailImpago`, en el dunning).
  Por eso esas tres reglas **no declaran EMAIL**.

Ninguna de estas es un descuido a corregir a ciegas: unificarlas significa
decidir qué preferencia manda y aceptar que alguien deje de recibir un correo que
hoy recibe. Documentado para que la próxima persona lo decida a propósito.
