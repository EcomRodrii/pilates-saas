// ─────────────────────────────────────────────────────────────────────────────
// Recordatorios de clase (push, 24h y 1h antes) — Notification Engine.
//
// Global (todos los estudios activos en una pasada), sin fan-out por estudio.
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A,
// barrido sin estado por ítem). No confundir con `lib/inngest/recordatorios.ts`
// (email/WhatsApp diario de las clases del día, bucket B, sigue en Inngest).
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { publish } from '@/lib/notifications/engine';
import { EVENTOS } from '@/lib/notifications/catalog';
import type { TipoExcepcion } from '@/lib/excepciones';
import type { SupabaseClient } from '@supabase/supabase-js';

// Tipado, no un literal suelto: una errata aquí apagaría la exención en
// silencio y nadie se enteraría hasta que una socia exenta recibiera el push.
const EXENCION_RECORDATORIO: TipoExcepcion = 'SIN_RECORDATORIO';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export async function recordatoriosClaseGlobal(): Promise<{ publicados: number } | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  return recordatoriosGlobal(admin);
}

async function recordatoriosGlobal(admin: SupabaseClient) {
  const ahora = Date.now();
  const desde = new Date(ahora).toISOString();
  const hasta = new Date(ahora + 25 * 3600_000).toISOString();
  // ⚠️ Todas las lecturas de aquí van PAGINADAS (`fetchAllRows`): al colapsar
  // el fan-out por estudio en una query global, cada lectura pasó de "las
  // filas de UN estudio" a "las de TODOS", y PostgREST corta en 1.000 filas
  // EN SILENCIO. Es exactamente el fallo que ya costó los backups (#684).
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

  // "No enviarle recordatorios" (B2.9). Se consulta aquí en lote.
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
