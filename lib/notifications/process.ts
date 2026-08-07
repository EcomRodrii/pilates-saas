// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — PROCESAMIENTO (server-only, node runtime).
//
// Aislado a propósito de engine.ts: aquí viven los CANALES (que importan
// web-push → módulos de Node como `net`). engine.ts (publish) es alcanzable
// desde módulos que también corren en el navegador (supabase-data vía import
// dinámico), así que NO debe arrastrar los canales al bundle de cliente. Este
// módulo solo lo importa la ruta /api/notifications/deliver (server).
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { REGLAS } from './catalog.ts';
import { CANALES } from './channels.ts';
import { crearInApp, canalesExtraDe, preferenciaDe, PREF_DEFECTO, type Preferencia } from './inapp.ts';
import type {
  NotificationCategory, NotificationChannel, NotificationEvent, NotificationRow, Recipient,
} from './types.ts';

// Preferencia/PREF_DEFECTO/canalesExtraDe/preferenciaDe viven en inapp.ts (que
// no importa canales) y se re-exportan aquí por compatibilidad.
export { canalesExtraDe, preferenciaDe, PREF_DEFECTO };
export type { Preferencia };

export interface ResultadoProceso { creadas: number; deliveries: number; omitidas: number; }

// Camino COMPLETO (in-app + canales) en una sola llamada. Ya no es el camino de
// producción —publish() crea la in-app en el acto y entrega los externos por la
// ruta interna— pero se conserva a propósito: es la unidad natural para tests
// (recibe `admin`, así que se inyecta sin mockear nada global) y para reprocesar
// un evento suelto a mano. La lógica que compone —crearInApp y entregarCanales—
// sí está en el camino vivo.
export async function procesarEvento(admin: SupabaseClient, event: NotificationEvent): Promise<ResultadoProceso> {
  const { creadas, omitidas } = await crearInApp(admin, event);
  let deliveries = creadas.length; // el delivery INAPP ya lo escribió crearInApp
  for (const c of creadas) {
    deliveries += await entregarCanales(admin, c.fila, c.destinatario, c.canalesExtra);
  }
  return { creadas: creadas.length, deliveries, omitidas };
}

// Envía los canales EXTERNOS de una notificación ya creada y registra su delivery.
async function entregarCanales(
  admin: SupabaseClient, fila: NotificationRow, dest: Recipient, canales: NotificationChannel[],
): Promise<number> {
  if (canales.length === 0) return 0;
  let n = 0;
  for (const ch of canales) {
    const canal = CANALES[ch];
    const res = canal
      ? await canal.enviar({ admin, notificacion: fila, destinatario: dest })
      : { status: 'SKIPPED' as const, error: `canal ${ch} no implementado` };
    await admin.from('notification_delivery').insert({
      id: `del-${randomUUID()}`,
      notification_id: fila.id,
      studio_id: fila.studioId,
      channel: ch,
      status: res.status,
      attempts: res.status === 'SENT' || res.status === 'DELIVERED' ? 1 : res.status === 'FAILED' ? 1 : 0,
      error: res.error ?? null,
      provider_id: res.providerId ?? null,
      sent_at: res.status === 'SENT' || res.status === 'DELIVERED' ? new Date().toISOString() : null,
    });
    n++;
  }
  return n;
}

// Lo que ejecuta /api/notifications/deliver: entregar los canales externos de
// notificaciones que YA existen (las creó publish() de forma síncrona).
// Recalcula los canales desde la regla + las preferencias del destinatario, así
// que no hace falta transportarlos en el evento.
// PostgREST mete los valores de `.in()` en la URL como query string. Un aviso a
// todo un estudio genera una notificación por destinatario, así que la lista
// puede ser de cientos de UUID: a ~37 bytes cada uno, 300 ids son ~11 KB de URL
// y muchos servidores/proxies cortan en 8 KB — un 414 que el bucle original,
// al ir de uno en uno, no podía provocar nunca. Se trocea para que el tamaño de
// la tanda no pueda romper nada.
const IDS_POR_CONSULTA = 100;

async function enLotes<T>(ids: string[], consulta: (lote: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const { data } = await consulta(ids.slice(i, i + IDS_POR_CONSULTA));
    if (data) out.push(...data);
  }
  return out;
}

export async function entregarExternos(
  admin: SupabaseClient, notificationIds: string[],
): Promise<{ entregadas: number; deliveries: number }> {
  // ⚠️ Se deduplica la entrada ANTES de nada. Antes esto era un bucle que
  // releía `notification_delivery` en cada vuelta, así que un id repetido en la
  // lista se frenaba solo: la segunda vuelta veía el delivery que escribió la
  // primera. Al leer los deliveries UNA vez por lotes esa protección
  // desaparecería y el id repetido mandaría dos push. Deduplicar la restaura, y
  // de paso hace explícito lo que antes era un efecto lateral.
  const ids = [...new Set(notificationIds)];
  if (ids.length === 0) return { entregadas: 0, deliveries: 0 };

  const [notis, previos] = await Promise.all([
    enLotes<Record<string, unknown>>(ids, lote => admin.from('notification').select('*').in('id', lote)),
    // Misma guarda de siempre: si una notificación ya tiene algún delivery que
    // no sea INAPP, no se repite. La ruta es pública para el propio servidor y
    // `publish()` podría llamarla dos veces por el mismo hecho; esto es lo que
    // evita el push duplicado.
    enLotes<Record<string, unknown>>(ids, lote => admin.from('notification_delivery')
      .select('notification_id').in('notification_id', lote).neq('channel', 'INAPP')),
  ]);

  const yaEntregadas = new Set(previos.map(p => p.notification_id as string));
  const orden = new Map(ids.map((id, i) => [id, i]));
  const pendientes = (notis ?? [])
    .filter(n => REGLAS[n.event_type as string] && !yaEntregadas.has(n.id as string))
    // `.in()` no garantiza orden; se restaura el de la lista de entrada para
    // que dos ejecuciones con los mismos ids hagan lo mismo en el mismo orden.
    .sort((a, b) => (orden.get(a.id as string) ?? 0) - (orden.get(b.id as string) ?? 0));
  if (pendientes.length === 0) return { entregadas: 0, deliveries: 0 };

  // Contactos y preferencias, agrupados por tipo de destinatario. Cada persona
  // se pide UNA vez aunque tenga varias notificaciones en la misma tanda.
  const unicos = <T>(v: (T | null | undefined)[]) => [...new Set(v.filter((x): x is T => !!x))];
  const socioIds = unicos(pendientes.map(n => n.recipient_socio_id as string | null));
  const instructorIds = unicos(pendientes.filter(n => !n.recipient_socio_id).map(n => n.recipient_instructor_id as string | null));
  const studioIds = unicos(pendientes.filter(n => !n.recipient_socio_id && !n.recipient_instructor_id).map(n => n.studio_id as string));
  const userIds = unicos(pendientes.map(n => n.recipient_user_id as string | null));
  const categorias = unicos(pendientes.map(n => REGLAS[n.event_type as string]?.category));

  type Fila = Record<string, unknown>;
  const [socFilas, insFilas, stFilas, prefFilas] = await Promise.all([
    enLotes<Fila>(socioIds, lote => admin.from('socios').select('id, email, telefono').in('id', lote)),
    enLotes<Fila>(instructorIds, lote => admin.from('instructores').select('id, email').in('id', lote)),
    enLotes<Fila>(studioIds, lote => admin.from('studios').select('id, email, telefono').in('id', lote)),
    // `categorias` está acotado por el catálogo de reglas, no por el tamaño de
    // la tanda: solo se trocean los user_id.
    enLotes<Fila>(userIds, lote => admin.from('notification_preference')
      .select('user_id, category, inapp, push, email, whatsapp, sms')
      .in('user_id', lote).in('category', categorias)),
  ]);

  const porId = (filas: Fila[]) => new Map(filas.map(r => [r.id as string, r]));
  const socios = porId(socFilas), instructores = porId(insFilas), studios = porId(stFilas);
  const prefs = new Map(prefFilas.map(p => [`${p.user_id}|${p.category}`, p]));

  let entregadas = 0, deliveries = 0;
  for (const noti of pendientes) {
    const regla = REGLAS[noti.event_type as string];
    const dest: Recipient = {
      role: noti.recipient_role as Recipient['role'],
      userId: noti.recipient_user_id as string | null,
      socioId: noti.recipient_socio_id as string | null,
      instructorId: noti.recipient_instructor_id as string | null,
    };
    // Email/teléfono para los canales externos (la fila no los guarda).
    if (dest.socioId) {
      const soc = socios.get(dest.socioId);
      dest.email = (soc?.email as string | null) ?? null;
      dest.telefono = (soc?.telefono as string | null) ?? null;
    } else if (dest.instructorId) {
      dest.email = (instructores.get(dest.instructorId)?.email as string | null) ?? null;
    } else {
      const st = studios.get(noti.studio_id as string);
      dest.email = (st?.email as string | null) ?? null;
      dest.telefono = (st?.telefono as string | null) ?? null;
    }

    const critica = regla.priority === 'CRITICA';
    const fila = dest.userId ? prefs.get(`${dest.userId}|${regla.category}`) : undefined;
    // Sin fila guardada se aplica el default, igual que hacía `preferenciaDe`.
    const pref: Preferencia = fila
      ? {
          inapp: fila.inapp as boolean, push: fila.push as boolean, email: fila.email as boolean,
          whatsapp: fila.whatsapp as boolean, sms: fila.sms as boolean,
        }
      : PREF_DEFECTO;
    const canales = canalesExtraDe(regla, pref, critica);
    const n = await entregarCanales(admin, mapRow(noti), dest, canales);
    if (n > 0) entregadas++;
    deliveries += n;
  }
  return { entregadas, deliveries };
}

function mapRow(row: Record<string, unknown>): NotificationRow {
  return {
    id: row.id as string, studioId: row.studio_id as string,
    recipientRole: row.recipient_role as NotificationRow['recipientRole'],
    recipientUserId: (row.recipient_user_id as string | null) ?? null,
    recipientSocioId: (row.recipient_socio_id as string | null) ?? null,
    recipientInstructorId: (row.recipient_instructor_id as string | null) ?? null,
    eventType: row.event_type as string, category: row.category as NotificationCategory,
    priority: row.priority as NotificationRow['priority'],
    title: row.title as string, body: row.body as string,
    resourceType: (row.resource_type as string | null) ?? null,
    resourceId: (row.resource_id as string | null) ?? null,
    deepLink: (row.deep_link as string | null) ?? null,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: null, archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: new Date().toISOString(),
  };
}

// Reintenta los deliveries fallidos de una notificación (Notification Center).
export async function retry(notificationId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: noti } = await admin.from('notification').select('*').eq('id', notificationId).maybeSingle();
  if (!noti) return;
  const { data: fallidos } = await admin.from('notification_delivery')
    .select('*').eq('notification_id', notificationId).eq('status', 'FAILED');
  for (const d of fallidos ?? []) {
    const canal = CANALES[d.channel as NotificationChannel];
    if (!canal) continue;
    const dest: Recipient = {
      role: noti.recipient_role, userId: noti.recipient_user_id,
      socioId: noti.recipient_socio_id, instructorId: noti.recipient_instructor_id,
    };
    const res = await canal.enviar({ admin, notificacion: mapRow(noti), destinatario: dest });
    await admin.from('notification_delivery').update({
      status: res.status, attempts: (d.attempts as number) + 1, error: res.error ?? null,
      sent_at: res.status === 'SENT' ? new Date().toISOString() : d.sent_at,
    }).eq('id', d.id);
  }
}
