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

- **Instant Booking:** firma HMAC-SHA256 (`MÉTODO\nRUTA COMPLETA\nX-Timestamp\ncuerpo`) con el client secret, ventana de ±5 min, códigos E001–E006. Lo que no hace falta para contestar va en `after()`: USC da 500-1000 ms y no reintenta.
- **Webhooks:** `x-signature-256` = SHA-256 del secreto compartido. Idempotentes por `Id + estado + ModifiedDate`, se aplican solo si son más recientes que el último aplicado (USC no garantiza el orden). Cancelled y LateCancellation cancelan en Tentare **sin** penalización del estudio; CheckedIn marca asistencia; NoShow, no vino.

- **Horario:** se publican las clases de las próximas dos semanas cuyo tipo (o la sesión) tiene plazas cedidas a USC (`plataforma_cupos`). Sin cifra, no se publica: ceder plazas ES publicar. `seats` = lo cedido (como mucho el aforo) y el `bookingCount` se calcula para que USC nunca enseñe más huecos de los reales (`bookingCountUsc`). Si aun así vende uno que ya no está, el Instant Booking contesta E001: el recuento es para su app, el candado es la RPC.
- **Cambios:** nombre, instructora, plazas, descripción y duración van por PATCH. Inicio, ubicación y plazo de cancelación tardía (de la ventana del tipo o del estudio, como mucho 12 h) no se pueden cambiar allí: se cancela y se crea otro, **y USC cancela sus reservas** (nos llegan por webhook). Una sesión borrada deja su evento con `sesion_id` a NULL y el cron lo cancela.
- **Instructoras:** se crean como trainers la primera vez que salen en un evento.
- **Idempotencia:** `Idempotency-Key` = sesión + inicio/ubicación/plazo; si la respuesta se perdió, se adopta el id que devuelve USC. Si el evento se crea y no se puede guardar aquí, se cancela allí (mismo motivo que la reunión huérfana de `zoom-sync`).
- **Tope:** 60 llamadas por pasada (el cron tiene 60 s); lo que no cabe va en la siguiente, primero las cancelaciones.
- ⚠️ **Sin contrato o suspendido = apagada** (decisión del fundador, 7-oct-2026; `lib/plataformas/venta-externa.ts`): baja de pago (`contrato_terminado_en`), prueba gratuita vencida (a su hora, sin esperar al barrido) o `suspendido_en`. El Instant Booking lo rechaza en cada petición (E002) y el cron cancela en USC todo lo publicado, como al apagar — y USC cancela esas reservas (nos llegan por webhook). `past_due` y `unpaid` siguen vendiendo: la suscripción sigue viva. Al reactivar, se vuelve a publicar en la siguiente pasada. Conexiones lo dice («En pausa») en vez de «van solos».

## IDs de proveedor y ubicación: uno por estudio (15-oct-2026)

- `PUT /api/integrations/config` pasa los IDs de USC por `prepararConfigUsc` (`lib/plataformas/usc/proveedor-config.ts`): formato UUID, normalizados, y rechazo con un único mensaje neutro si otro estudio ya los tiene o si USC no los reconoce (no revela de quién son).
- **Con credenciales:** se comprueba con `GET /locations` que el proveedor existe y que la ubicación es suya y está `Active`. Si USC no responde, 503 y no se guarda nada.
- **Sin credenciales (hoy):** se guardan pero **sin verificar**. «Verificado» lo escribe solo el servidor (`verificadoPar`, ligado al par exacto) y el cron `usc-horario` no llama a USC con IDs sin verificar. Al haber credenciales, la propietaria vuelve a pulsar «Guardar conexión» y queda verificado. Un estudio con eventos ya publicados antes de esto (ninguno) no se retiraría.
- Un proveedor por estudio: una cadena con un solo proveedor de USC y varias sedes de Tentare no está contemplada (decisión conservadora; reabrir con USC si aparece el caso).
- **Aplicada en producción el 5-nov-2026: `20261105153241_usc_proveedor_unico.sql`** (antes `20261015110000`; dos índices únicos parciales, solo aditiva). Es el candado real frente a dos guardados simultáneos con el mismo ID.
- Cuando se mergee la confirmación de avisos de integrador (#2722), su ruta debe sellar `verificadoPar` (ya comprueba `GET /locations`); si no, esos estudios no publicarán hasta volver a guardar.

## Estado a 5-nov-2026: sandbox concedido

USC dio el sandbox el 5-nov (proveedor y ubicación de pruebas, credenciales de sandbox y de producción, cuenta demo de socia, acceso al Partner Portal). Las credenciales viven solo en Vercel y en el gestor de contraseñas del fundador: nunca en el repo ni en el chat.

- **Hecho:** `/auth` y `GET /locations` responden contra el sandbox; variables `USC_CLIENT_ID`, `USC_CLIENT_SECRET` y `USC_WEBHOOK_SECRET` en Vercel (solo producción, las dos últimas «sensitive»); webhook registrado en el sandbox (`POST /webhook-endpoints`, tipos `[1, 4]`, URL con `www`); índices únicos aplicados.
- ⚠️ **Las variables hoy son las de SANDBOX.** USC usa el mismo host para sandbox y producción (`connect.urbansportsclub.io`): lo que cambia es el client id. Para el beta se cambian `USC_CLIENT_ID` y `USC_CLIENT_SECRET` por las de producción, y se vuelve a registrar el webhook con la de producción.
- ⚠️ **Un solo endpoint de Instant Booking por `clientId`, y nosotros verificamos UN secreto.** Lo firma USC con el secreto de su entorno: mientras las variables sean las de sandbox, un Instant Booking de producción se rechazaría (E006). Por eso solo se registra el endpoint en el sandbox hasta el beta.
- ⚠️ **Registrar siempre la URL con `www`**: `tentare.app` redirige con 308 a `www.tentare.app` y no hay que fiarse de que USC siga una redirección en un POST.

## Qué falta

1. ~~**Programar el cron**~~ **Hecho el 5-nov-2026** (`20261105161200_pg_cron_usc_horario.sql`, job `usc-horario`, `*/15 * * * *`, URL `/api/cron/usc-horario`). Sin estudios conectados cada tic no hace nada, pero gasta una invocación.
2. **Integration Review Document** (Google Doc de USC): contestarlo y avisar a USC cuando esté listo. Hace falta que lo compartan con una cuenta de Google nuestra.
3. **Que USC registre el endpoint de Instant Booking** (`https://www.tentare.app/api/plataformas/usc/reservar`) en su sistema, para el sandbox.
4. **Un estudio de pruebas conectado** al proveedor y la ubicación del sandbox (Conexiones → Urban Sports Club; el formulario aparece al haber credenciales) y plazas cedidas a USC en algún tipo de clase.
5. **Probar en su sandbox** el ciclo entero antes del primer estudio real: crear, mover de hora (recrear), cancelar, reservar, cancelar tarde, check-in.
6. **Conciliación diaria** con `GET /bookings`.
7. ~~**Borrado de datos de la socia**~~ **Hecho el 5-nov-2026** (anexo 1 del contrato, §6(4) y §11(2)): un trigger de `reservas` (`20261105154832_usc_borrar_datos_al_cerrar_reserva.sql`) deja `nombre_externo` como «Persona eliminada» y borra `id_cliente_externo` cuando una reserva de USC pasa a cancelada o no asistida, por cualquier camino (webhook, recepción, cancelación de la clase). La asistida conserva sus datos; el id de la reserva en USC se queda. ⚠️ Su nombre tiene que sonar DESPUÉS de `trg_congelar_origen_reserva` (los BEFORE disparan por orden alfabético): lo fija `lib/plataformas/usc/borrado-al-cerrar-contrato.test.ts`. Pendiente solo: avisar de brechas «inmediatamente» (§9) y actualizar `/privacidad` con USC como destinatario.
