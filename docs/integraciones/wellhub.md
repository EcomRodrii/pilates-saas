# Wellhub: cómo está montado y qué falta para encenderlo

Estado a 7-oct-2026. Documentación pública de Wellhub: https://developers.wellhub.com (Booking API, Access
Control API, Integration Setup API) y su colección de Postman «Quick Start Guide | Booking & Access Control API».

⚠️ Wellhub **no deja publicar clases presenciales sin software integrado**: su portal no tiene horario. Sin esta
integración, un estudio solo recibe check-ins sueltos que valida a mano en su portal.

## Qué hay ya

| Pieza | Dónde |
|---|---|
| Gym de Wellhub de cada estudio, único por gym | `plataforma_conexiones` (migr `20261007170000`), se vincula desde /interno |
| Clase de Wellhub de cada tipo de clase y gym, con el gym en que se publicó | `plataforma_clases` |
| Slot de Wellhub de cada sesión | `plataforma_eventos` (+ `contenedor_externo_id` = su clase) |
| Check-ins pendientes de validar | `plataforma_checkins` (el Wellhub ID solo mientras está pendiente) |
| Publicar el horario y la ocupación | `lib/plataformas/wellhub/horario*.ts`, cron `app/api/cron/wellhub-horario` (SIN programar) |
| Reservas, cancelaciones y check-ins entrantes | `POST /api/plataformas/wellhub/webhook` |
| Validar al pasar lista (panel y app de la instructora) | `validarAsistenciaWellhub`, `POST /api/plataformas/wellhub/validar` |

### Horario

- Una **clase** de Wellhub por tipo de clase de Tentare (`reference` = id del tipo) y un **slot** por sesión, a dos
  semanas vista, de los tipos (o sesiones) con plazas cedidas a Wellhub (`plataforma_cupos`). Ceder plazas es publicar.
- `occur_date` en hora local de Madrid con su offset; `cancellable_until` = la ventana de cancelación del tipo o del
  estudio, como mucho 24 h (Wellhub no admite más).
- `total_booked` lo mantenemos nosotros con TODAS las reservas: libres en Wellhub = min(cedidas − suyas, aforo − todas).
- Las clases no se borran en Wellhub: se ocultan. Un slot se borra si la clase se cancela o se borra en Tentare (y
  sus reservas de Wellhub se cancelan aquí en el mismo paso: no consta que llegue el aviso).
- ⚠️ **Lo ya vendido se respeta**: si se dejan de ceder plazas, el estudio deja de vender en Wellhub, la sesión cambia
  de tipo o el estudio cambia de gym, un slot con socias de Wellhub no se borra ni se mueve (cancelaría sus reservas): se
  deja de vender (capacidad = las que hay) y se mueve cuando ya no tiene ninguna.
- Quitar algo publicado se hace con el gym en que se publicó, nunca con la conexión de hoy. Por eso la clase se guarda por
  tipo **y** gym: al cambiar de gym, la vieja sigue apuntada (con sus slots y sus reservas) hasta ocultarla.

### Reservas (webhook `booking-requested` → `PATCH /booking/v2/gyms/:gym/bookings/:booking_number`)

- Wellhub da **1 s** para contestar al webhook, reintenta 3 veces y, tras un 200, nunca más. Así que ANTES de contestar
  se hace una escritura durable: `reservar_plaza_externa` (con su candado y el cupo como límite, igual que USC) y la
  reserva queda en `estado_externo = 'Requested'`. El PATCH RESERVED va después.
- ⚠️ **Una sola confirmación a la vez.** Quien va a mandar el RESERVED coge antes la reserva (`estado_externo =
  'Confirming'`, condicional a lo leído) y nadie más le habla de ella a Wellhub durante 2 min. Pasa de verdad: un
  webhook en arranque en frío tarda más de 1 s, Wellhub lo repite al instante y las dos confirmaciones corrían a la vez;
  si su PATCH no admite repetirse, una recibía 204 y la otra un 4xx que cancelaba la plaza.
- **Regla de negocio, no de reloj**: una reserva pedida solo se cancela aquí cuando Wellhub contesta que no (4xx) a su
  **primer** RESERVED. Sin respuesta (o con 401/403, que son nuestras credenciales) se conserva la plaza y el cron lo
  reintenta (Sentry avisa pasados 15 min). Si un RESERVED anterior pudo llegar, un 4xx no prueba nada —su doc no dice
  si el PATCH se puede repetir— y se conserva la plaza (salvo 404: no conoce la reserva); Sentry lo avisa con la clave
  del error, para saber qué hace su PATCH.
- ⚠️ **El estudio cancela aquí una reserva confirmada allí** (recepción, clase cancelada, mínimo de asistentes…): el cron
  se lo dice a Wellhub con `CANCELLED_BY_GYM`, al gym donde se reservó. Si no, la socia la seguiría viendo en su app.
- Rechazos con su `reason_category` (`CLASS_IS_FULL`, `USER_IS_ALREADY_BOOKED`, `CLASS_HAS_BEEN_CANCELED`,
  `CLASS_NOT_FOUND`, `CHECK_IN_AND_CANCELATION_WINDOWS_CLOSED`, `PREREQUISITES`, `TECHNICAL_ERROR`).
- El gym del evento tiene que ser el del estudio dueño de esa clase, y el estudio tiene que vender en Wellhub.

### Cancelaciones (`booking-canceled`, `booking-late-canceled`)

Se marca `estado_externo` antes de contestar y se cancela después, sin penalización del estudio (la tardía la cobra
Wellhub), por el dueño único `ejecutarCancelacionReserva`.

### Check-ins y cobro (Access Control)

- Wellhub solo paga el check-in **validado**. Exige dos métodos de validación y uno el automático: Tentare usa el
  automático (webhook `checkin` / `checkin-booking-occurred` → `POST /access/v1/validate`) y el de pasar lista (panel y
  app de la instructora), que enseña el motivo si Wellhub dice que no.
- El check-in se apunta como PENDIENTE antes de contestar; al resolverse se borra el Wellhub ID de la fila.
- Con `booking_number` se casa con su reserva, exacto; sin él, con la clase cuyo margen (30 min antes y después) lo
  contiene.

### Firma de los webhooks

`X-Gympass-Signature` = HMAC-SHA1 del cuerpo con nuestro secreto, en hexadecimal. Su doc se contradice (prefijo «0X»
en el ejemplo, mayúsculas o minúsculas): se acepta con o sin «0X» y en cualquier caja, y si no casa con el cuerpo crudo
se prueba con el objeto reserializado (Sentry avisa si es así, para quitar la variante que no se use). Admite el
secreto actual y el anterior, para rotarlo.

## Qué falta (necesita sus credenciales)

1. **Credenciales de prueba.** Pedidas a su equipo de integraciones el 7-oct (Tech Sales da las «Test Environment
   Credentials»: System ID + API Key).
2. **Variables en Vercel:** `WELLHUB_API_TOKEN`, `WELLHUB_WEBHOOK_SECRET` (y `WELLHUB_WEBHOOK_SECRET_ANTERIOR` al
   rotarlo), `WELLHUB_API_URL` (sandbox: `https://apitesting.partners.gympass.com`; por defecto, producción) y, si lo
   dan, `WELLHUB_SYSTEM_ID`. Sin token y secreto, el webhook rechaza todo y el cron no hace nada.
3. **Registrar nuestro webhook** en Wellhub (`https://www.tentare.app/api/plataformas/wellhub/webhook`, los cinco
   eventos, con nuestro secreto y `additional_data: false`). En esta fase, a mano con su equipo (su Integration Setup
   API no tiene sandbox documentado).
4. **Vincular un estudio de pruebas** desde /interno (gym + producto) y cederle plazas a Wellhub en un tipo de clase.
5. **Programar el cron** (migración pg_cron como la de usc-horario, `*/15 * * * *`, `/api/cron/wellhub-horario`). No
   antes: cada tic sin credenciales es una invocación de Vercel tirada.
6. **Probar en su sandbox el ciclo entero** con sus simuladores (`/helper/v1/gyms/:gym/simulate/bookings`, `…/cancel`,
   `…/simulate/checkins`): publicar, reservar, rechazar por lleno, cancelar, cancelar tarde, check-in con y sin
   reserva, pasar lista. Los previews no se construyen: se prueba contra producción con el estudio de pruebas.
7. **Después**: el formulario de la propietaria en Conexiones (con la Setup API: `SYSTEM_INTEGRATION_REQUESTED`, lista de
   gyms y alta de webhooks por gym), y varios productos por estudio.

## Preguntas abiertas que resuelve el sandbox

Prefijo «0X» y caja de la firma, y si se firma el cuerpo crudo; qué contesta el PATCH pasados los 15 min, y a un
RESERVED repetido (¿204 otra vez o un 4xx?: hoy se conserva la plaza, ver Reservas); si `CANCELLED_BY_GYM` vale sobre una
reserva ya aceptada y si pide `reason_category` (hoy se manda sin ella); si un check-in con reserva llega por
`checkin-booking-occurred` y también por `checkin` (el segundo queda YA_VALIDADO y no cuenta como otra visita); si basta
validar para cobrar una clase reservada o hay que marcarla «Completed»; segundos o milisegundos en cada evento; si
`occur_date` acepta UTC; `rate` o `rating`; si pagan los no-shows en España.
