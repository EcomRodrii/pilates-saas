-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: la clave de deduplicación de las notificaciones pasa a llevar la
-- SUPERFICIE, y las filas de staff ya escritas se ponen al día.
--
-- Contexto: `lib/notifications/inapp.ts` construía la clave con (hecho,
-- persona). Quien es staff Y socia del mismo estudio con la misma cuenta
-- recibía las dos filas del mismo evento con la MISMA clave, la segunda chocaba
-- con `uq_notification_dedup` y se descartaba en silencio. Desde que
-- `lib/notifications/ambito.ts` separa las dos campanas, esa fila perdida ya no
-- se ve en ningún sitio: un `pago.fallido` que la propietaria sí ve en el panel
-- deja de existir para ella como socia en el portal.
--
-- El código pasa a escribir `<clave>:<persona>:staff` para el lado staff y deja
-- `<clave>:<persona>` intacto para el lado socia (la asimetría es deliberada:
-- varios crons republican la misma clave de socia durante días y su evento
-- declara PUSH, así que cambiarles el formato habría reenviado esos push la
-- primera vez que corriera el cron tras el deploy). Esta migración le da a las
-- filas de staff ya existentes el formato nuevo, para que el cambio sea un
-- no-op también para ellas y ningún cron de staff duplique una tarjeta in-app
-- a caballo del deploy.
--
-- Sobre `uq_notification_dedup` (UNIQUE (studio_id, dedup_key) WHERE dedup_key
-- IS NOT NULL, migración 0092): añadir un sufijo constante a un subconjunto
-- disjunto preserva la unicidad mientras NINGUNA clave existente termine ya en
-- ':staff'. Hoy eso se cumple: `inapp.ts` cierra siempre la clave con el
-- identificador del destinatario (uuid de auth, id prefijado de socia/
-- instructora, o 'anon'), y el único sufijo manual que hay en el repo es el
-- ':owner' de `emitirReserva`. No es una garantía absoluta, es una comprobada:
-- si alguna vez dejara de serlo, el UPDATE aborta con 23505 y la migración
-- falla entera — ruidoso, nunca corrupción silenciosa.
--
-- `recipient_role` es NOT NULL (0092), así que `<> 'SOCIA'` no se deja fuera
-- ninguna fila por el agujero habitual de los NULL.
--
-- El `NOT LIKE '%:staff'` hace la migración idempotente (correrla dos veces no
-- encadena sufijos). Es la mitad del trato: a cambio, si en el futuro alguien
-- introdujera una clave que ya acabe en ':staff', esa fila se saltaría y otra
-- podría chocar contra ella. Se acepta porque encadenar sufijos rompería el
-- dedup de TODAS las filas de staff, y esto solo podría romper una.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.notification
   SET dedup_key = dedup_key || ':staff'
 WHERE dedup_key IS NOT NULL
   AND recipient_role <> 'SOCIA'
   AND dedup_key NOT LIKE '%:staff';
