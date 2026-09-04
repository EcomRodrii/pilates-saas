// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — bonos a punto de caducar / clientas inactivas.
//
// Piloto de arquitectura (2026-08-11): salió de Inngest a pg_cron (bucket A).
// El fan-out por estudio de Inngest (un evento por estudio → worker) se
// colapsa en un simple bucle: con ~10 estudios activos y sin llamadas
// externas pesadas por estudio, un `for` dentro de la misma invocación es
// más simple que una cola, y ya no hace falta pagar por cada paso.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { idsEstudios } from '@/lib/inngest/estudios.ts';
import { publish } from '@/lib/notifications/engine';
import { EVENTOS } from '@/lib/notifications/catalog';
import { fechaCortaEstudio } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

const fecha = (d: string) => fechaCortaEstudio(new Date(d + 'T12:00:00Z'));

// ⚠️ Ninguna lectura de este fichero puede tragarse su `error` ni leer sin
// paginar. Se tragaban los dos: un fallo de PostgREST dejaba `data: null`, el
// bucle iteraba `[]` y el barrido devolvía `{publicados: 0}` con un 200 — «no
// había a quién avisar» y «no he podido mirar» se leían igual. Y aunque las
// lecturas van acotadas a UN estudio, las de `sesiones` (180 días) y `reservas`
// pasan de mil filas en un estudio activo, y PostgREST corta ahí EN SILENCIO:
// el mapa de última asistencia salía falso y con él la lista de inactivas.
//
// Los errores se PROPAGAN: las rutas de cron (app/api/cron/notif-bonos y
// notif-inactivas) los convierten en 500 + Sentry, que es lo que hace visible
// un barrido que no ha barrido nada.
function exigir(error: { message: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.message}`);
}

// PostgREST mete los valores de `.in()` en la URL: con 180 días de sesiones de
// un estudio activo la lista pasa de mil UUID (~37 KB) y el proxy responde 414.
// Se trocea, y cada trozo va paginado. Mismo criterio que `enLotes` de
// lib/notifications/process.ts.
const IDS_POR_CONSULTA = 100;

async function leerEnLotes<T>(
  studioId: string, tabla: string, ids: string[],
  consulta: (lote: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const lote = ids.slice(i, i + IDS_POR_CONSULTA);
    const { data, error } = await fetchAllRows<T>(studioId, tabla, (from, to) => consulta(lote, from, to));
    exigir(error, `leyendo ${tabla}`);
    filas.push(...data);
  }
  return filas;
}

async function estudiosIds(admin: SupabaseClient): Promise<string[]> {
  return (await idsEstudios(admin)).map((s) => s.id);
}

// ── Bonos a punto de caducar: suscripciones ACTIVA con sesiones y fecha_fin ≤7d ─
export async function barrerBonosPorCaducar(): Promise<{ estudios: number; publicados: number } | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  const studios = await estudiosIds(admin);
  let publicados = 0;
  for (const studioId of studios) publicados += (await bonos(admin, studioId)).publicados;
  return { estudios: studios.length, publicados };
}

async function bonos(admin: SupabaseClient, studioId: string) {
  const hoy = new Date().toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10);
  const [subsR, studioR] = await Promise.all([
    fetchAllRows<{ id: string; socio_id: string | null; fecha_fin: string; sesiones_restantes: number }>(
      studioId, 'suscripciones',
      (from, to) => admin.from('suscripciones').select('id, socio_id, fecha_fin, sesiones_restantes')
        .eq('studio_id', studioId).eq('estado', 'ACTIVA')
        .not('sesiones_restantes', 'is', null).gt('sesiones_restantes', 0)
        .not('fecha_fin', 'is', null).gte('fecha_fin', hoy).lte('fecha_fin', en7).range(from, to),
    ),
    admin.from('studios').select('slug').eq('id', studioId).maybeSingle(),
  ]);
  exigir(subsR.error, 'leyendo suscripciones');
  exigir(studioR.error, 'leyendo el estudio');
  const subs = subsR.data;
  const slug = (studioR.data?.slug as string | null) ?? '';
  let publicados = 0;
  for (const su of subs) {
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
export async function barrerClientasInactivas(): Promise<{ estudios: number; publicados: number } | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  const studios = await estudiosIds(admin);
  let publicados = 0;
  for (const studioId of studios) publicados += (await inactivas(admin, studioId)).publicados;
  return { estudios: studios.length, publicados };
}

async function inactivas(admin: SupabaseClient, studioId: string) {
  const ahora = Date.now();
  const hace180 = new Date(ahora - 180 * 24 * 3600_000).toISOString();
  const hace30 = ahora - 30 * 24 * 3600_000;
  // Sesiones pasadas del estudio en la ventana (para acotar el escaneo).
  const sesionesR = await fetchAllRows<{ id: string; inicio: string }>(
    studioId, 'sesiones',
    (from, to) => admin.from('sesiones').select('id, inicio')
      .eq('studio_id', studioId).gte('inicio', hace180).lte('inicio', new Date(ahora).toISOString()).range(from, to),
  );
  exigir(sesionesR.error, 'leyendo sesiones');
  const sesiones = sesionesR.data;
  if (!sesiones.length) return { publicados: 0 };
  const inicioById = new Map(sesiones.map((s) => [s.id as string, new Date(s.inicio as string).getTime()]));
  const reservas = await leerEnLotes<{ socio_id: string | null; sesion_id: string }>(
    studioId, 'reservas', [...inicioById.keys()],
    (lote, from, to) => admin.from('reservas').select('socio_id, sesion_id')
      .eq('studio_id', studioId).in('estado', ['ASISTIDA', 'CONFIRMADA']).in('sesion_id', lote).range(from, to),
  );
  // Última asistencia por socia.
  const ultima = new Map<string, number>();
  for (const r of reservas) {
    const t = inicioById.get(r.sesion_id as string);
    if (t == null || !r.socio_id) continue;
    const prev = ultima.get(r.socio_id as string) ?? 0;
    if (t > prev) ultima.set(r.socio_id as string, t);
  }
  const idsInactivas = [...ultima.entries()].filter(([, t]) => t < hace30).map(([id]) => id);
  if (!idsInactivas.length) return { publicados: 0 };
  const socios = await leerEnLotes<{ id: string; nombre: string | null; apellidos: string | null }>(
    studioId, 'socios', idsInactivas,
    (lote, from, to) => admin.from('socios').select('id, nombre, apellidos')
      .eq('studio_id', studioId).in('id', lote).range(from, to),
  );
  const nombre = new Map(socios.map((s) => [s.id as string, `${s.nombre ?? ''} ${s.apellidos ?? ''}`.trim() || 'Una clienta']));
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
