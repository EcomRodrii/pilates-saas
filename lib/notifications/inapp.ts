// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — creación de la notificación IN-APP (síncrona).
//
// Esto es lo que hace que el sistema NO dependa de nada externo: escribir la
// fila de `notification` es un INSERT, y se hace en el acto, dentro de la misma
// petición que provocó el evento. Pase lo que pase después, la campana SIGUE
// funcionando. (El motor llegó a depender de una cola de Inngest y un fallo
// silencioso nos dejó sin ninguna notificación en producción; de ahí esto.)
//
// Los canales EXTERNOS (push/email/WhatsApp/SMS) sí son lentos: se entregan
// aparte, con un salto HTTP a /api/notifications/deliver (best-effort, con
// timeout) usando los ids que devuelve esta función. Por eso aquí NO se importa `channels.ts` — arrastra `web-push`
// (módulos de Node) y este módulo es alcanzable desde el bundle de cliente.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { REGLAS, plantillaDe, render, type ReglaEvento } from './catalog.ts';
import { ambitoDeRol } from './ambito.ts';
import { resolverDestinatarios } from './recipients.ts';
import type {
  NotificationCategory, NotificationChannel, NotificationEvent, NotificationRow, Recipient,
} from './types.ts';

export interface Preferencia { inapp: boolean; push: boolean; email: boolean; whatsapp: boolean; sms: boolean; }
export const PREF_DEFECTO: Preferencia = { inapp: true, push: true, email: false, whatsapp: false, sms: false };

// Canales EXTRA (además del in-app) para un destinatario.
//
// **`regla.canales` es la AUTORIDAD**: un evento solo sale por los canales que
// declara. La preferencia del usuario solo puede QUITAR (opt-out), nunca añadir
// —antes EMAIL/WhatsApp/SMS se colaban en CUALQUIER evento de la categoría con
// solo activar la preferencia, así que la regla no mandaba en su propio evento—.
// Las CRÍTICAS ignoran la preferencia, pero siguen sin inventarse canales: usan
// los declarados (los no configurados acaban en SKIPPED). Por eso no hace falta
// una lista de exclusiones: "no declarado" ya significa "nunca".
const PREF_DE_CANAL: Record<NotificationChannel, keyof Preferencia | null> = {
  INAPP: 'inapp', PUSH: 'push', EMAIL: 'email', WHATSAPP: 'whatsapp', SMS: 'sms',
};

export function canalesExtraDe(regla: ReglaEvento, pref: Preferencia, critica: boolean): NotificationChannel[] {
  return regla.canales.filter(canal => {
    if (canal === 'INAPP') return false;          // el in-app no es un canal "extra"
    if (critica) return true;
    const clave = PREF_DE_CANAL[canal];
    return clave ? pref[clave] : false;
  });
}

export async function preferenciaDe(
  admin: SupabaseClient, userId: string, category: NotificationCategory,
): Promise<Preferencia> {
  const { data } = await admin.from('notification_preference')
    .select('inapp, push, email, whatsapp, sms').eq('user_id', userId).eq('category', category).maybeSingle();
  if (!data) return PREF_DEFECTO;
  return {
    inapp: data.inapp as boolean, push: data.push as boolean, email: data.email as boolean,
    whatsapp: data.whatsapp as boolean, sms: data.sms as boolean,
  };
}

export interface NotificacionCreada {
  id: string;
  destinatario: Recipient;
  canalesExtra: NotificationChannel[];
  // La fila recién creada, para que quien entregue los canales externos no tenga
  // que volver a leerla de la base de datos.
  fila: NotificationRow;
}

export interface ResultadoInApp {
  creadas: NotificacionCreada[];
  omitidas: number;
}

// Crea la notificación in-app de cada destinatario del evento (y su delivery
// INAPP). Idempotente por `dedup_key`: reprocesar el mismo hecho no duplica.
// Devuelve, por notificación creada, qué canales externos habría que intentar.
export async function crearInApp(admin: SupabaseClient, event: NotificationEvent): Promise<ResultadoInApp> {
  const regla = REGLAS[event.type];
  if (!regla) return { creadas: [], omitidas: 0 };

  const destinatarios = event.recipients ?? await resolverDestinatarios(admin, regla.audiencia, event);
  const data = event.data ?? {};
  const creadas: NotificacionCreada[] = [];
  let omitidas = 0;

  for (const dest of destinatarios) {
    const pl = plantillaDe(event.type, dest.role);
    if (!pl) { omitidas++; continue; }

    const critica = regla.priority === 'CRITICA';
    const pref = dest.userId ? await preferenciaDe(admin, dest.userId, regla.category) : PREF_DEFECTO;
    const quiereInapp = critica || pref.inapp;
    const canalesExtra = canalesExtraDe(regla, pref, critica);
    if (!quiereInapp && canalesExtra.length === 0) { omitidas++; continue; }

    // La unidad de "un hecho → una notificación" es (hecho, persona, SUPERFICIE
    // donde se ve), no (hecho, persona). Una misma cuenta puede recibir el mismo
    // evento con dos roles de superficies distintas — `mostrador-y-socia` en
    // pago.fallido (quien es propietaria y socia del mismo estudio) y
    // `socias-e-instructora-de-la-sesion` en clase.cancelada/modificada (quien
    // imparte la clase y además tiene plaza en ella)—. Sin la superficie en la
    // clave, la segunda fila choca con `uq_notification_dedup`, el 23505 de
    // abajo se la traga como si fuera un reproceso, y el aviso desaparece de UNA
    // de las dos campanas desde que `ambito.ts` las separó. Ojo con "arreglarlo"
    // metiendo `dest.role` crudo: la audiencia `mostrador` resuelve por dos vías
    // (propietaria() y recepcionistas()), así que quien sea dueña Y tenga ficha
    // de RECEPCION/MANAGER en su estudio recibiría DOS avisos en la MISMA
    // campana. Con el ámbito las dos caen en 'staff' y se siguen deduplicando.
    //
    // Se sufija SOLO el lado staff, a conciencia, en vez de sufijar los dos:
    //  · Generaliza el apaño manual que `emitirReserva` ya hacía a mano
    //    (`emit.ts`: `${dedup}` para la socia, `${dedup}:owner` para mostrador).
    //  · Y sobre todo deja INTACTAS las claves de socia ya escritas. Varios
    //    crons republican la MISMA clave durante días —`bono-caduca:<id>` se
    //    reemite cada mañana hasta 7 veces (`notif-automations.ts`)— y su evento
    //    declara PUSH con la preferencia por defecto en ON: cambiarles el
    //    formato habría reenviado ese push a toda socia con un bono por caducar
    //    la primera vez que corriera el cron tras el deploy. Del lado staff no
    //    republica nada con canales externos, y la migración
    //    20260805013000 sufija las filas ya escritas para no dejar ni ese hueco.
    const ambito = ambitoDeRol(dest.role);
    const quien = dest.userId ?? dest.socioId ?? dest.instructorId ?? 'anon';
    const dedupKey = event.dedupKey
      ? `${event.dedupKey}:${quien}${ambito === 'staff' ? ':staff' : ''}`
      : null;

    const id = `not-${crypto.randomUUID()}`;
    const title = render(pl.title, data);
    const body = render(pl.body, data);
    const deepLink = pl.deepLink?.(data) ?? null;
    const archivedAt = quiereInapp ? null : new Date().toISOString();
    const { error } = await admin.from('notification').insert({
      id,
      studio_id: event.studioId,
      recipient_role: dest.role,
      recipient_user_id: dest.userId,
      recipient_socio_id: dest.socioId ?? null,
      recipient_instructor_id: dest.instructorId ?? null,
      event_type: event.type,
      category: regla.category,
      priority: regla.priority,
      title,
      body,
      resource_type: event.resource?.type ?? null,
      resource_id: event.resource?.id ?? null,
      deep_link: deepLink,
      data,
      dedup_key: dedupKey,
      // Si no quiere in-app pero sí un canal externo, la fila existe (es el ancla
      // del envío y del historial) pero nace archivada: fuera de la campana.
      archived_at: archivedAt,
    });
    if (error) {
      // 23505 = choque con dedup → ese hecho ya se notificó a esta persona.
      if ((error as { code?: string }).code !== '23505') {
        console.error('[notifications] insert falló:', error.message);
      }
      omitidas++;
      continue;
    }

    // Delivery del canal in-app: la propia fila ES la entrega. Sin cuenta
    // reclamada no puede iniciar sesión → SKIPPED.
    if (quiereInapp) {
      await admin.from('notification_delivery').insert({
        id: `del-${crypto.randomUUID()}`,
        notification_id: id,
        studio_id: event.studioId,
        channel: 'INAPP',
        status: dest.userId ? 'SENT' : 'SKIPPED',
        attempts: dest.userId ? 1 : 0,
        error: dest.userId ? null : 'destinatario sin cuenta',
        sent_at: dest.userId ? new Date().toISOString() : null,
      });
    }

    creadas.push({
      id, destinatario: dest, canalesExtra,
      fila: {
        id, studioId: event.studioId, recipientRole: dest.role,
        recipientUserId: dest.userId, recipientSocioId: dest.socioId ?? null,
        recipientInstructorId: dest.instructorId ?? null,
        eventType: event.type, category: regla.category, priority: regla.priority,
        title, body,
        resourceType: event.resource?.type ?? null, resourceId: event.resource?.id ?? null,
        deepLink, data, readAt: null, archivedAt, createdAt: new Date().toISOString(),
      },
    });
  }

  return { creadas, omitidas };
}
