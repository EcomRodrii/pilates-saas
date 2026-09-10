# Auditoria 45a pasada - Notification Engine (lib/notifications/)

**Fecha**: 2026-09-10
**Alcance**: motor de notificaciones (emit.ts, engine.ts, process.ts, inapp.ts, recipients.ts, channels.ts, catalog.ts, ambito.ts), rutas app/api/notifications/**, app/api/cron/notif-*, y los llamadores externos (mensajeria, Network, Community OS, buzon de documentos) que disparan eventos con datos de destinatario controlados por el cliente.

## Resumen ejecutivo

Este area ya ha sido objeto de un numero inusualmente alto de correcciones de seguridad en pasadas previas y en el propio desarrollo de features (RLS de notification/notification_delivery/notification_template cerrada en dos migraciones dedicadas: 20260729172349 y 20260805195208/20260805195400; "rol no comprobado" ya cerrado en app/api/notifications/admin/route.ts; cross-tenant en push_subscription/notification_preference ya cerrado en subscribe/route.ts y preferences/route.ts; WhatsApp/SMS retirados el 2026-09-09). Tras revisar exhaustivamente el motor y sus puntos de entrada NO he encontrado ningun hallazgo nuevo de severidad critica o alta. Documento a continuacion lo verificado punto por punto de la checklist del encargo, y dos observaciones de severidad BAJA (una de higiene, una teorica sin impacto real hoy).

Nada de esto es una auditoria en blanco: el motor de notificaciones de Tentare es, junto con las tablas notification*, de las superficies mejor auditadas del repo - la cantidad de comentarios de aviso dentro del propio codigo citando auditorias anteriores (23a, 26a, 29a) lo confirma. El trabajo real de esta pasada fue verificar que esas correcciones siguen en pie y que ninguna feature nueva (Network, Community OS, buzon de documentos, mensajeria) reabrio alguno de esos patrones.

## Verificacion punto por punto (checklist del encargo)

### 1. Cross-tenant / cross-socia en resolucion de destinatarios

lib/notifications/recipients.ts es la unica puerta de traduccion audiencia-a-personas. Todas las funciones que resuelven por id (sociaPorId, sociasPorLista, instructoraPorId, sociasDeSesion, participanteConversacionPorAuthUserId) filtran SIEMPRE por .eq(studio_id, studioId) ademas del id recibido - asi que aunque un socioId/instructorId/authUserId llegue falsificado desde event.data (que en varios casos viaja desde un body controlado por el cliente, p. ej. authUserIds en mensajeria), la resolucion nunca puede devolver a alguien de otro estudio: como mucho devuelve cero destinatarios (recipients.ts:138-148, 187-196, 198-207, 254-286). Esto es defensa en profundidad correcta.

Casos especiales de Network (porAuthUserId, porListaAuthUserIds) resuelven fuera del studioId a proposito (documentado en el propio codigo, recipients.ts:86-100) porque la audiencia es explicitamente esa persona por su cuenta, no alguien de este estudio - no es un descuido, es el comportamiento correcto para ese dominio.

### 2. Contenido de la notificacion (inyeccion)

- render() (catalog.ts:1041-1043) solo sustituye placeholders con llaves que existen literalmente en la PLANTILLA estatica del catalogo - el dato de usuario se usa como VALOR de sustitucion, nunca como plantilla.
- El canal EMAIL escapa title/body con esc() (channels.ts:99,117-121) antes de insertarlos en el HTML.
- Los deepLink de catalog.ts interpolan exclusivamente ids generados por el sistema (UUIDs de sesion/reserva/recibo) o el slug del propio estudio, nunca texto libre de socia/instructora.
- Push/in-app pintan title/body como texto plano (React escapa por defecto; el payload de Web Push no ejecuta HTML).

### 3. RLS de notification/notification_delivery/notification_preference/push_subscription

Ya cerrado en pasadas anteriores y reverificado aqui:
- notification_select/notification_update: recipient_user_id = (select auth.uid()) unicamente (20260805195208).
- notification_delivery: SIN ninguna politica tras 20260805195400 - deny-all para authenticated/anon; los unicos consumidores son service-role.
- notification_preference/push_subscription: user_id = auth.uid() en ambas.
- El Notification Center (app/api/notifications/admin/route.ts) usa service-role y su unica cerradura es puedeVerCentroNotificaciones(rol) => rol === PROPIETARIO.

### 4. Deduplicacion (dedupKey) por estudio

uq_notification_dedup es UNIQUE(studio_id, dedup_key) (0092:39) - la clave de dedup nunca colisiona entre estudios distintos aunque el string del dedupKey sea identico. Revisado tambien claveDedup()/identidadesEnDosBandejas() (inapp.ts:76-121), correcto y ya cubierto por dedup.test.ts.

### 5. WhatsApp/Meta

Ya no aplica: WhatsApp y SMS fueron retirados del motor el 2026-09-09 (channels.ts:150-176, CANALES solo registra INAPP/PUSH/EMAIL). notification_preference conserva las columnas whatsapp/sms como datos inertes, sin ningun canal que las lea.

### 6. Grants de funciones SECURITY DEFINER

No hay ninguna funcion SECURITY DEFINER propia del Notification Engine. get_advisors(security) no senala ninguna tabla/funcion de notification* fuera de la ya documentada y deliberada notification_delivery (rls_enabled_no_policy, INFO, deny-all intencional).

### 7. Marcar como leida / preferencias de otra persona

PATCH /api/notifications acota TODA escritura (read, unread, read-all, archive) por recipient_user_id = auth.uid(). PUT /api/notifications/preferences y POST /api/notifications/subscribe ya validan pertenencia del studioId al usuario antes de escribir.

## Hallazgos

### Severidad BAJA - H1: notification_preference no esta particionada por estudio

**Archivo**: lib/notifications/inapp.ts:53-63, app/api/notifications/preferences/route.ts:19-26, migracion 0092_notification_engine.sql (uq_preference_user_cat = UNIQUE(user_id, category), sin studio_id).

Las preferencias de canal se guardan por (user_id, category), sin studio_id en la clave de unicidad. Para una persona con cuentas en varios estudios (instructora multi-sede, P2-14; o una propietaria de cadena), apagar el email de pagos en un estudio lo apaga tambien en todos los demas donde tenga rol, porque es la misma fila. NO es un fallo de autorizacion - sigue siendo unicamente SU preferencia - pero puede sorprender a una instructora de dos sedes.

**Propuesta**: si se quiere granularidad por sede, anadir studio_id a la clave de unicidad y a la query de GET/PUT.

### Severidad BAJA - H2: s() en catalog.ts no url-encodea el slug al construir deepLink

**Archivo**: lib/notifications/catalog.ts:500, usado en decenas de funciones deepLink que interpolan el slug del estudio en la ruta.

El slug se interpola crudo sin encodeURIComponent. Hoy es inofensivo porque el slug se valida/normaliza en su creacion y nunca es texto libre de una socia. Riesgo teorico si algun dia se anade un campo de texto libre a un deepLink futuro.

**Propuesta**: si se anade algun evento nuevo con un campo de texto libre dentro de un deepLink, envolverlo en encodeURIComponent en ese punto concreto.

## Lo que NO se encontro (y se busco activamente)

- Ningun endpoint de este motor confia en el rol declarado por el cliente sin comprobarlo en servidor.
- Ningun camino permite leer o escribir notificaciones/preferencias/suscripciones push de otro usuario o de otro estudio.
- Ninguna via de auto-escalada de rol relacionada con notificaciones.
- Ningun secreto (CRON_SECRET, SUPABASE_CRON_SECRET, RESEND_API_KEY, VAPID_PRIVATE_KEY) se expone al cliente ni se loguea.
- Ningun evento permite a un estudio disparar una notificacion hacia una persona de otro estudio distinto de los casos de Network/Community explicitamente disenados para cruzar.

## Conclusion

No se abre ningun hallazgo bloqueante en esta pasada. El Notification Engine es, de las 45 areas auditadas hasta ahora en este repo, una de las que menos margen deja para el patron recurrente de rol no comprobado en servidor: cada ruta comprobada ya tiene su verificacion de sesion + rol/pertenencia, y la RLS de las cuatro tablas centrales esta cerrada por destinatario/usuario desde hace varias migraciones. Las dos observaciones de severidad baja quedan documentadas para que no se reintroduzcan por descuido en desarrollo futuro, no porque representen un riesgo actual.
