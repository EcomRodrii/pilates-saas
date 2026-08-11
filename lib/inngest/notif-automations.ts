// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — AUTOMATIZACIONES (crons → publish).
//
// Tres dispatchers cron detectan condiciones y PUBLICAN eventos de
// notificación (el motor decide destinatarios/canales). La idempotencia la
// garantiza el `dedup_key` del motor: aunque el cron re-escanee, cada hecho
// genera una sola notificación.
//
// Bonos/inactivas (poco frecuentes) hacen fan-out de un evento por estudio a
// `procesarAutomacionEstudio`. Recordatorios (cada 15 min) NO — ver el
// comentario de `notifRecordatoriosDispatcher` sobre por qué.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest, EVENTS, enviarFanOutEnLotes } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { idsEstudios } from './estudios.ts';
import { fetchAllRows } from '@/lib/supabase-data';
import { publish } from '@/lib/notifications/engine';
import { EVENTOS } from '@/lib/notifications/catalog';
import type { TipoExcepcion } from '@/lib/excepciones';
import type { SupabaseClient } from '@supabase/supabase-js';

// Tipado, no un literal suelto: una errata aquí (`SIN_RECORDATORIOS`) apagaría
// la exención en silencio y nadie se enteraría hasta que una socia exenta
// recibiera el push.
const EXENCION_RECORDATORIO: TipoExcepcion = 'SIN_RECORDATORIO';

type TipoAutomacion = 'bonos' | 'inactivas';

// Ids de todos los estudios activos (para el fan-out). `suspendido_en`: un
// estudio suspendido no debe seguir mandando recordatorios/avisos a sus socias.
async function estudiosIds(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  return (await idsEstudios(admin)).map((s) => s.id);
}
// Recordatorios (24 h y 1 h antes): cada 15 min.
//
// ⚠️ SIN fan-out por estudio (a diferencia de bonos/inactivas, mucho más
// espaciados). Con fan-out y 10 estudios activos esto eran ~960 ejecuciones/día
// (96 tics × 10 estudios) solo para este cron — el 70%+ del consumo mensual de
// Inngest del plan free (alerta de la plataforma al 84% del límite,
// 2026-08-08). Mismo motivo y mismo arreglo que ya se aplicó en
// reservas-pendientes-expirar.ts/lista-espera-ofertas-expirar.ts: una única
// query global (`recordatoriosGlobal`), sin nada caro que decidir por estudio.
export const notifRecordatoriosDispatcher = inngest.createFunction(
  { id: 'notif-recordatorios-dispatcher', triggers: [{ cron: '*/15 * * * *' }] },
  async ({ step }) => {
    return step.run('recordatorios', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      return recordatoriosGlobal(admin);
    });
  },
);
// Bonos a punto de caducar: cada mañana.
export const notifBonosDispatcher = inngest.createFunction(
  { id: 'notif-bonos-dispatcher', triggers: [{ cron: '0 9 * * *' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    await enviarFanOutEnLotes(step, 'fan-out', EVENTS.NOTIF_AUTOMACION_ESTUDIO, studios, (studioId: string) => ({ studioId, tipo: 'bonos' as TipoAutomacion }));
    return { studios: studios.length };
  },
);
// Clientas inactivas (30 días sin venir): lunes por la mañana.
export const notifInactivasDispatcher = inngest.createFunction(
  { id: 'notif-inactivas-dispatcher', triggers: [{ cron: '0 10 * * 1' }] },
  async ({ step }) => {
    const studios = await step.run('studios', estudiosIds);
    await enviarFanOutEnLotes(step, 'fan-out', EVENTS.NOTIF_AUTOMACION_ESTUDIO, studios, (studioId: string) => ({ studioId, tipo: 'inactivas' as TipoAutomacion }));
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
      if (tipo === 'bonos') return bonos(admin, studioId);
      return inactivas(admin, studioId);
    });
  },
);

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const fecha = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

// ── Recordatorios: reservas confirmadas cuya sesión empieza en ~24 h o ~1 h ────
// Global (todos los estudios activos en una pasada) — ver comentario del
// dispatcher sobre por qué esto ya no hace fan-out por estudio.
async function recordatoriosGlobal(admin: SupabaseClient) {
  const ahora = Date.now();
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + 25 * 3600_000).toISOString();
  // ⚠️ Todas las lecturas de aquí van PAGINADAS (`fetchAllRows`), no por gusto:
  // al colapsar el fan-out por estudio en una query global —lo que salvó la
  // cuota de Inngest— cada lectura pasó de "las filas de UN estudio" a "las de
  // TODOS", y PostgREST corta en 1.000 filas EN SILENCIO. Sin paginar, a partir
  // de unas decenas de estudios activos las socias de la parte truncada dejan
  // de recibir el recordatorio de su clase sin que salte ningún error. Es
  // exactamente el fallo que ya costó los backups (#684).
  const { data: studiosActivos } = await fetchAllRows<{ id: string; slug: string | null }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios').select('id, slug').is('suspendido_en', null).range(from, to),
  );
  if (!studiosActivos.length) return { publicados: 0 };
  const slugById = new Map(studiosActivos.map((s) => [s.id, s.slug ?? '']));

  const { data: sesiones } = await fetchAllRows<{ id: string; studio_id: string; inicio: string; tipo_clase_id: string | null }>(
    '(global)', 'sesiones',
    (from, to) => admin.from('sesiones')
      .select('id, studio_id, inicio, tipo_clase_id').eq('cancelada', false)
      .in('studio_id', studiosActivos.map((s) => s.id))
      .gte('inicio', desde).lte('inicio', hasta).range(from, to),
  );
  if (!sesiones.length) return { publicados: 0 };
  const sesById = new Map(sesiones.map((s) => [s.id, s]));

  const [{ data: tipos }, { data: reservas }] = await Promise.all([
    fetchAllRows<{ id: string; nombre: string }>(
      '(global)', 'tipos_clase',
      (from, to) => admin.from('tipos_clase').select('id, nombre')
        .in('id', [...new Set(sesiones.map(s => s.tipo_clase_id as string).filter(Boolean))]).range(from, to),
    ),
    fetchAllRows<{ id: string; studio_id: string; socio_id: string | null; sesion_id: string }>(
      '(global)', 'reservas',
      (from, to) => admin.from('reservas').select('id, studio_id, socio_id, sesion_id')
        .eq('estado', 'CONFIRMADA').in('sesion_id', [...sesById.keys()]).range(from, to),
    ),
  ]);
  const nombre = new Map(tipos.map((t) => [t.id, t.nombre]));

  // "No enviarle recordatorios" (B2.9). `lib/excepciones.ts` lo describe sin
  // matices —"no recibirá el recordatorio automático de sus clases próximas"— y
  // su cabecera afirma que TODAS las automatizaciones que escriben a la socia lo
  // consultan antes. Esta no lo hacía: el camino viejo (email/WhatsApp, en
  // `enviarRecordatoriosClasesProximas`) sí lo respetaba, así que la propietaria
  // marcaba la casilla, dejaba de salir el correo, y el móvil le seguía sonando
  // con el push. Se consulta aquí en lote, mismo criterio que allí.
  const socioIds = [...new Set(reservas.map(r => r.socio_id as string).filter(Boolean))];
  const { data: exentosR } = socioIds.length
    ? await fetchAllRows<{ socio_id: string }>(
        '(global)', 'socio_excepciones',
        (from, to) => admin.from('socio_excepciones').select('socio_id')
          .eq('tipo', EXENCION_RECORDATORIO).in('socio_id', socioIds).range(from, to),
      )
    : { data: [] as { socio_id: string }[] };
  const exentos = new Set(exentosR.map(e => e.socio_id));

  let publicados = 0;
  for (const r of reservas) {
    const ses = sesById.get(r.sesion_id as string);
    if (!ses || !r.socio_id) continue;
    if (exentos.has(r.socio_id as string)) continue;
    const horas = (new Date(ses.inicio as string).getTime() - ahora) / 3600_000;
    const tipo = horas >= 23.5 && horas <= 24.5 ? '24h' : horas >= 0.75 && horas <= 1.25 ? '1h' : null;
    if (!tipo) continue;
    const studioId = ses.studio_id as string;
    await publish({
      type: tipo === '24h' ? EVENTOS.RECORDATORIO_24H : EVENTOS.RECORDATORIO_1H,
      studioId,
      data: { clase: nombre.get(ses.tipo_clase_id as string) ?? 'tu clase', hora: hora(ses.inicio as string), slug: slugById.get(studioId) ?? '', sesionId: ses.id, socioId: r.socio_id },
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
