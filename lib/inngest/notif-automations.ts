// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — AUTOMATIZACIONES (crons → publish).
//
// Tres dispatchers cron hacen fan-out de un evento por estudio; un único worker
// detecta la condición y PUBLICA eventos de notificación (el motor decide
// destinatarios/canales). La idempotencia la garantiza el `dedup_key` del motor:
// aunque el cron re-escanee, cada hecho genera una sola notificación.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest, EVENTS } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { publish } from '@/lib/notifications/engine';
import { EVENTOS } from '@/lib/notifications/catalog';
import type { SupabaseClient } from '@supabase/supabase-js';

type TipoAutomacion = 'recordatorios' | 'bonos' | 'inactivas';

// Ids de todos los estudios (para el fan-out).
async function estudiosIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin.from('studios').select('id');
  return (data ?? []).map((s) => s.id as string);
}
const fanOutPayload = (studios: string[], tipo: TipoAutomacion) =>
  studios.map((studioId) => ({ name: EVENTS.NOTIF_AUTOMACION_ESTUDIO, data: { studioId, tipo } }));

// Recordatorios (24 h y 1 h antes): cada 15 min.
export const notifRecordatoriosDispatcher = inngest.createFunction(
  { id: 'notif-recordatorios-dispatcher', triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    if (studios.length) await step.sendEvent('fan-out', fanOutPayload(studios, 'recordatorios'));
    return { studios: studios.length };
  },
);
// Bonos a punto de caducar: cada mañana.
export const notifBonosDispatcher = inngest.createFunction(
  { id: 'notif-bonos-dispatcher', triggers: [{ cron: '0 9 * * *' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    if (studios.length) await step.sendEvent('fan-out', fanOutPayload(studios, 'bonos'));
    return { studios: studios.length };
  },
);
// Clientas inactivas (30 días sin venir): lunes por la mañana.
export const notifInactivasDispatcher = inngest.createFunction(
  { id: 'notif-inactivas-dispatcher', triggers: [{ cron: '0 10 * * 1' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    if (studios.length) await step.sendEvent('fan-out', fanOutPayload(studios, 'inactivas'));
    return { studios: studios.length };
  },
);

// Worker por estudio: ejecuta la detección según el tipo.
export const procesarAutomacionEstudio = inngest.createFunction(
  { id: 'notif-automacion-estudio', triggers: [{ event: EVENTS.NOTIF_AUTOMACION_ESTUDIO }], concurrency: { limit: 5 }, retries: 2 },
  async ({ event, step }) => {
    const { studioId, tipo } = event.data as { studioId: string; tipo: TipoAutomacion };
    return step.run('detectar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      if (tipo === 'recordatorios') return recordatorios(admin, studioId);
      if (tipo === 'bonos') return bonos(admin, studioId);
      return inactivas(admin, studioId);
    });
  },
);

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fecha = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

// ── Recordatorios: reservas confirmadas cuya sesión empieza en ~24 h o ~1 h ────
async function recordatorios(admin: SupabaseClient, studioId: string) {
  const ahora = Date.now();
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + 25 * 3600_000).toISOString();
  const { data: sesiones } = await admin.from('sesiones')
    .select('id, inicio, tipo_clase_id').eq('studio_id', studioId).eq('cancelada', false)
    .gte('inicio', desde).lte('inicio', hasta);
  if (!sesiones?.length) return { publicados: 0 };
  const sesById = new Map(sesiones.map((s) => [s.id as string, s]));
  const [{ data: tipos }, { data: studio }, { data: reservas }] = await Promise.all([
    admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId),
    admin.from('studios').select('slug').eq('id', studioId).maybeSingle(),
    admin.from('reservas').select('id, socio_id, sesion_id').eq('studio_id', studioId).eq('estado', 'CONFIRMADA').in('sesion_id', [...sesById.keys()]),
  ]);
  const nombre = new Map((tipos ?? []).map((t) => [t.id as string, t.nombre as string]));
  const slug = (studio?.slug as string | null) ?? '';
  let publicados = 0;
  for (const r of reservas ?? []) {
    const ses = sesById.get(r.sesion_id as string);
    if (!ses || !r.socio_id) continue;
    const horas = (new Date(ses.inicio as string).getTime() - ahora) / 3600_000;
    const tipo = horas >= 23.5 && horas <= 24.5 ? '24h' : horas >= 0.75 && horas <= 1.25 ? '1h' : null;
    if (!tipo) continue;
    await publish({
      type: tipo === '24h' ? EVENTOS.RECORDATORIO_24H : EVENTOS.RECORDATORIO_1H,
      studioId,
      data: { clase: nombre.get(ses.tipo_clase_id as string) ?? 'tu clase', hora: hora(ses.inicio as string), slug, sesionId: ses.id, socioId: r.socio_id },
      resource: { type: 'sesion', id: ses.id as string },
      dedupKey: `recordatorio-${tipo}:${r.id}`,
    });
    publicados++;
  }
  return { publicados };
}

// ── Bonos a punto de caducar: suscripciones ACTIVA con sesiones y fecha_fin ≤7d ─
async function bonos(admin: SupabaseClient, studioId: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);
  const [{ data: subs }, { data: studio }] = await Promise.all([
    admin.from('suscripciones').select('id, socio_id, fecha_fin, sesiones_restantes')
      .eq('studio_id', studioId).eq('estado', 'ACTIVA')
      .not('sesiones_restantes', 'is', null).gt('sesiones_restantes', 0)
      .not('fecha_fin', 'is', null).gte('fecha_fin', hoy).lte('fecha_fin', en7),
    admin.from('studios').select('slug').eq('id', studioId).maybeSingle(),
  ]);
  const slug = (studio?.slug as string | null) ?? '';
  let publicados = 0;
  for (const su of subs ?? []) {
    if (!su.socio_id) continue;
    await publish({
      type: EVENTOS.BONO_POR_CADUCAR, studioId,
      data: { sesiones: su.sesiones_restantes, fecha: fecha(su.fecha_fin as string), slug, socioId: su.socio_id },
      resource: { type: 'suscripcion', id: su.id as string },
      dedupKey: `bono-caduca:${su.id}`,
    });
    publicados++;
  }
  return { publicados };
}

// ── Clientas inactivas: última asistencia hace 30-180 días (se avisa a la dueña) ─
async function inactivas(admin: SupabaseClient, studioId: string) {
  const ahora = Date.now();
  const hace180 = new Date(ahora - 180 * 24 * 3600_000).toISOString();
  const hace30 = ahora - 30 * 24 * 3600_000;
  // Sesiones pasadas del estudio en la ventana (para acotar el escaneo).
  const { data: sesiones } = await admin.from('sesiones')
    .select('id, inicio').eq('studio_id', studioId).gte('inicio', hace180).lte('inicio', new Date(ahora).toISOString());
  if (!sesiones?.length) return { publicados: 0 };
  const inicioById = new Map(sesiones.map((s) => [s.id as string, new Date(s.inicio as string).getTime()]));
  const { data: reservas } = await admin.from('reservas')
    .select('socio_id, sesion_id').eq('studio_id', studioId).in('estado', ['ASISTIDA', 'CONFIRMADA']).in('sesion_id', [...inicioById.keys()]);
  // Última asistencia por socia.
  const ultima = new Map<string, number>();
  for (const r of reservas ?? []) {
    const t = inicioById.get(r.sesion_id as string);
    if (t == null || !r.socio_id) continue;
    const prev = ultima.get(r.socio_id as string) ?? 0;
    if (t > prev) ultima.set(r.socio_id as string, t);
  }
  const idsInactivas = [...ultima.entries()].filter(([, t]) => t < hace30).map(([id]) => id);
  if (!idsInactivas.length) return { publicados: 0 };
  const { data: socios } = await admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', idsInactivas);
  const nombre = new Map((socios ?? []).map((s) => [s.id as string, `${s.nombre ?? ''} ${s.apellidos ?? ''}`.trim() || 'Una clienta']));
  const mes = new Date(ahora).toISOString().slice(0, 7);
  let publicados = 0;
  for (const socioId of idsInactivas) {
    const dias = Math.floor((ahora - (ultima.get(socioId) ?? ahora)) / (24 * 3600_000));
    await publish({
      type: EVENTOS.SOCIA_INACTIVA, studioId,
      data: { socia: nombre.get(socioId) ?? 'Una clienta', dias, socioId },
      resource: { type: 'socio', id: socioId },
      dedupKey: `inactiva:${socioId}:${mes}`,
    });
    publicados++;
  }
  return { publicados };
}
