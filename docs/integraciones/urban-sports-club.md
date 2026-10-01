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

- **Instant Booking:** firma HMAC-SHA256 (`MÉTODO\nRUTA COMPLETA\nX-Timestamp\ncuerpo`) con el client secret, ventana de ±5 min, códigos E001–E006. Lo que no hace falta para contestar va en `after()`: USC da 500-1000 ms y no reintenta.
- **Webhooks:** `x-signature-256` = SHA-256 del secreto compartido. Idempotentes por `Id + estado + ModifiedDate`, se aplican solo si son más recientes que el último aplicado (USC no garantiza el orden). Cancelled y LateCancellation cancelan en Tentare **sin** penalización del estudio; CheckedIn marca asistencia; NoShow, no vino.

## Qué falta (necesita sus credenciales)

1. **Contrato y sandbox.** Correo enviado a su dirección de integraciones el 28-sep, sin respuesta a 1-oct.
2. **Variables en Vercel:** `USC_CLIENT_ID`, `USC_CLIENT_SECRET` (firma del Instant Booking) y `USC_WEBHOOK_SECRET` (distinto del anterior, lo elegimos nosotros al registrar el webhook). Sin ellas, los dos endpoints rechazan todo.
3. **Publicar el horario:** crear los Events de cada clase en USC (≤ 2 semanas vista; no se puede cambiar hora ni sede de un evento: se cancela y se crea otro) y guardar su id en `plataforma_eventos`. Hasta entonces ningún evento resuelve y el Instant Booking contesta E002.
4. **Avisar de las plazas** que se ocupan por otras vías («Update Booking Count»).
5. **Registrar las URLs** en su Integration Review Document: `https://tentare.app/api/plataformas/usc/reservar` y `…/webhook`.
6. **Conciliación diaria** con `GET /bookings`.
