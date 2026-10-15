# Urban Sports Club: cómo está montado y qué falta para encenderlo

Estado a 1-oct-2026. Documentación de USC: https://docs.urbansportsclub.io

## Qué hay ya

| Pieza | Dónde | Estado |
|---|---|---|
| Reservas de plataformas en `reservas` (`origen`, `nombre_externo`, ids externos) | migr `20261001115953` | En producción |
| `reservar_plaza_externa` (mismo candado y aforo que una socia; cupo exigible) | migr `20261001115958` | En producción |
| Mapa clase de Tentare ↔ evento de USC (`plataforma_eventos`) y `reservas.estado_externo(_en)` | migr `20261001132641` | En producción |
| Instant Booking: `POST /api/plataformas/usc/reservar` | `app/api/plataformas/usc/reservar` | Construido y probado sin credenciales |
| Webhooks de estado: `POST /api/plataformas/usc/webhook` | `app/api/plataformas/usc/webhook` | Construido y probado sin credenciales |
| Modo manual (recepción apunta las ventas) | Conexiones + hoja de la clase | En producción |
| Publicar el horario y la ocupación (cron `usc-horario`) | `lib/plataformas/usc/horario*.ts`, `app/api/cron/usc-horario` | Construido, cron SIN programar |
| Huellas de lo enviado y mapa instructora ↔ trainer (`plataforma_instructoras`) | migr `20261001140635` | En producción |
| ID de proveedor y de ubicación por estudio | Conexiones → Urban Sports Club | Solo aparece con credenciales |
| Avisos de integrador («Integrator Update», webhook tipo 4): el ID de proveedor llega solo | `lib/plataformas/usc/avisos*.ts`, `app/api/plataformas/usc/avisos`, tarjeta en Conexiones | Construido y probado sin credenciales. **APAGADO** (`USC_AVISOS_INTEGRADOR`); migr `20261015100000` escrita y **sin aplicar** |

- **Instant Booking:** firma HMAC-SHA256 (`MÉTODO\nRUTA COMPLETA\nX-Timestamp\ncuerpo`) con el client secret, ventana de ±5 min, códigos E001–E006. Lo que no hace falta para contestar va en `after()`: USC da 500-1000 ms y no reintenta.
- **Webhooks:** `x-signature-256` = SHA-256 del secreto compartido. Idempotentes por `Id + estado + ModifiedDate`, se aplican solo si son más recientes que el último aplicado (USC no garantiza el orden). Cancelled y LateCancellation cancelan en Tentare **sin** penalización del estudio; CheckedIn marca asistencia; NoShow, no vino.

- **Horario:** se publican las clases de las próximas dos semanas cuyo tipo (o la sesión) tiene plazas cedidas a USC (`plataforma_cupos`). Sin cifra, no se publica: ceder plazas ES publicar. `seats` = lo cedido (como mucho el aforo) y el `bookingCount` se calcula para que USC nunca enseñe más huecos de los reales (`bookingCountUsc`). Si aun así vende uno que ya no está, el Instant Booking contesta E001: el recuento es para su app, el candado es la RPC.
- **Cambios:** nombre, instructora, plazas, descripción y duración van por PATCH. Inicio, ubicación y plazo de cancelación tardía (de la ventana del tipo o del estudio, como mucho 12 h) no se pueden cambiar allí: se cancela y se crea otro, **y USC cancela sus reservas** (nos llegan por webhook). Una sesión borrada deja su evento con `sesion_id` a NULL y el cron lo cancela.
- **Instructoras:** se crean como trainers la primera vez que salen en un evento.
- **Idempotencia:** `Idempotency-Key` = sesión + inicio/ubicación/plazo; si la respuesta se perdió, se adopta el id que devuelve USC. Si el evento se crea y no se puede guardar aquí, se cancela allí (mismo motivo que la reunión huérfana de `zoom-sync`).
- **Tope:** 60 llamadas por pasada (el cron tiene 60 s); lo que no cabe va en la siguiente, primero las cancelaciones.
- ⚠️ **Sin contrato o suspendido = apagada** (decisión del fundador, 7-oct-2026; `lib/plataformas/venta-externa.ts`): baja de pago (`contrato_terminado_en`), prueba gratuita vencida (a su hora, sin esperar al barrido) o `suspendido_en`. El Instant Booking lo rechaza en cada petición (E002) y el cron cancela en USC todo lo publicado, como al apagar — y USC cancela esas reservas (nos llegan por webhook). `past_due` y `unpaid` siguen vendiendo: la suscripción sigue viva. Al reactivar, se vuelve a publicar en la siguiente pasada. Conexiones lo dice («En pausa») en vez de «van solos».

## Avisos de integrador (Provider ID automático)

- USC avisa por el webhook tipo 4 (`IntegratorAssociated/Updated/Removed`, `IntegratorLocationAdded/Terminated`). No trae ningún dato de Tentare: solo el ID de proveedor y, en el alta, el nombre. Por eso **nada se aplica solo**: el aviso va a un buzón (`usc_avisos_integrador`, huella única, orden por `ModifiedDate`), se le ofrece a UN estudio (el único cuyo nombre normalizado coincide, entre TODOS los estudios) y su propietaria lo confirma.
- Confirmar: el servidor comprueba con `GET /locations?providerId=` (credenciales de integrador) y exige exactamente una ubicación `Active`; el índice único parcial deja un proveedor por estudio; nunca sobrescribe un `providerId` ya puesto (queda como «conflicto», sin botón).
- Interruptor `USC_AVISOS_INTEGRADOR` (`on` | `estudios:<id1>,<id2>` | vacío). Recibir: `on` o lista no vacía; mostrar y confirmar: por estudio. ⚠️ Con él vacío el aviso se pierde (USC no reintenta tras el 200): encenderlo ANTES de registrar la URL.
- Riesgo residual: si el nombre del aviso es la razón social y otro estudio se llama igual, puede confirmar ese proveedor. Y `PUT /api/integrations/config` sigue aceptando cualquier ID a mano (hueco previo, decisión aparte).

## Qué falta (necesita sus credenciales)

1. **Contrato y sandbox.** Correo enviado a su dirección de integraciones el 28-sep, sin respuesta a 1-oct.
2. **Variables en Vercel:** `USC_CLIENT_ID`, `USC_CLIENT_SECRET` (firma del Instant Booking) y `USC_WEBHOOK_SECRET` (distinto del anterior, lo elegimos nosotros al registrar el webhook). Sin ellas, los dos endpoints rechazan todo.
   Opcional `USC_API_URL` para apuntar al sandbox; por defecto, producción.
3. **Programar el cron** (no antes: cada tic sin credenciales es una invocación de Vercel tirada). Migración nueva, mismo patrón que `20260820193434_pg_cron_zoom_sync.sql`, job `usc-horario`, `*/15 * * * *`, URL `/api/cron/usc-horario`.
4. **Aplicar la migración `20261015100000`, encender `USC_AVISOS_INTEGRADOR` y suscribir el webhook tipo 4** (`types: [1,4]`) para que el ID llegue solo; verificar en el sandbox qué contesta `GET /locations` con un proveedor ajeno y si emite estos avisos. Si no, **que el estudio pegue sus IDs** en Conexiones → Urban Sports Club (el formulario aparece solo cuando están las credenciales) y ceda plazas en los tipos que quiera publicar.
5. **Registrar las URLs** en su Integration Review Document: `https://www.tentare.app/api/plataformas/usc/reservar` y `…/webhook`.
6. **Conciliación diaria** con `GET /bookings`.
7. **Probar en su sandbox** el ciclo entero antes del primer estudio real: crear, mover de hora (recrear), cancelar, reservar, cancelar tarde, check-in.
