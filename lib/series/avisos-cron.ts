// ─────────────────────────────────────────────────────────────────────────────
// Series que se acaban: renovación automática y avisos (PR-B).
//
// Una vez al día (pg_cron → /api/cron/series-renovacion). Por estudio activo
// (sin suspender y con suscripción viva), sobre lo que ya devuelve
// `series_por_renovar` (terminan en 30 días o terminaron hace menos de 14, sin
// «no renovar», sin la cola cancelada a propósito ni la que ya continúa en otra
// serie):
//
//  1. Las que tienen `renovacion_automatica` y aún no han terminado se renuevan
//     con `renovar_serie` (origen 'automatica', las semanas del último período).
//     Una ya terminada no: crearía clases con fecha pasada sin que nadie viera
//     la simulación, así que se avisa. Idempotente: manda el período que acaba
//     de leer, y la RPC vuelve a comprobar con la fila bloqueada que la
//     automática siga activada. Si no se puede, se avisa con el motivo y se
//     vuelve a intentar mañana.
//  2. Del resto, las que suben de tramo (14 / 7 / final) entran en UN aviso por
//     estudio; el tramo se marca como avisado solo si el aviso se ha creado.
//
// Un `for` sin fan-out de Inngest (va al ~84 % del plan): son pocos estudios y
// pocas series por estudio. Un estudio que falla no deja sin avisos a los demás.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { hoyEnEstudio } from '@/lib/utils';
import { emitirSeriesPorTerminar, emitirSeriesRenovadasSolas } from '@/lib/notifications/emit';
import {
  diasHastaFin, fechaDMY, mensajeErrorRenovar, nombreSerie, resultadoDeRpc, seriePorRenovarDeFila, type SeriePorRenovar,
} from '@/lib/series-renovacion';
import { esUrgente, listaAviso, resumenAviso, resumenRenovadas, tocaAvisar, tramoDe, type TramoAviso } from '@/lib/series-avisos';
import { reservarPlazasFijasRenovadas } from '@/lib/series/plazas-tras-renovar';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Resumen = { renovadas: number; avisadas: number; fallidas: number };

// Un estudio que se ha ido no debe seguir creando clases ni recibiendo avisos.
const SUSCRIPCION_TERMINADA = ['trial_expirado', 'canceled'];

export async function barrerSeriesPorRenovar(): Promise<({ estudios: number; errores: number } & Resumen) | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };

  const [series, activos] = await Promise.all([
    fetchAllRows<{ studio_id: string }>(
      '(global)', 'series',
      (from, to) => admin.from('series').select('studio_id').eq('no_renovar', false).order('id').range(from, to),
    ),
    fetchAllRows<{ id: string; subscription_status: string | null }>(
      '(global)', 'studios',
      (from, to) => admin.from('studios').select('id, subscription_status').is('suspendido_en', null).order('id').range(from, to),
    ),
  ]);
  if (series.error) throw new Error(`leyendo series: ${series.error.message}`);
  if (activos.error) throw new Error(`leyendo estudios: ${activos.error.message}`);
  const vivos = new Set(activos.data
    .filter(s => !SUSCRIPCION_TERMINADA.includes(s.subscription_status ?? ''))
    .map(s => s.id));
  const estudios = [...new Set(series.data.map(r => r.studio_id))].filter(id => vivos.has(id));
  const hoy = hoyEnEstudio();

  const total: Resumen = { renovadas: 0, avisadas: 0, fallidas: 0 };
  let errores = 0;
  for (const studioId of estudios) {
    try {
      const r = await barrerEstudio(admin, studioId, hoy);
      total.renovadas += r.renovadas;
      total.avisadas += r.avisadas;
      total.fallidas += r.fallidas;
    } catch (err) {
      errores++;
      console.error('[series-renovacion]', studioId, err instanceof Error ? err.message : err);
    }
  }
  return { estudios: estudios.length, errores, ...total };
}

async function barrerEstudio(admin: Admin, studioId: string, hoy: string): Promise<Resumen> {
  const { data, error } = await admin.rpc('series_por_renovar', { p_studio_id: studioId, p_dias: 30 });
  if (error) throw new Error(error.message);
  const series = ((data ?? []) as Record<string, unknown>[]).map(seriePorRenovarDeFila);
  if (series.length === 0) return { renovadas: 0, avisadas: 0, fallidas: 0 };

  const [{ data: salas }, { data: tipos }] = await Promise.all([
    admin.from('salas').select('id, nombre').eq('studio_id', studioId),
    admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId),
  ]);
  const nombre = (s: SeriePorRenovar) => nombreSerie(
    s,
    id => (tipos ?? []).find(t => t.id === id)?.nombre as string | undefined,
    id => (salas ?? []).find(x => x.id === id)?.nombre as string | undefined,
  );

  const renovadas: { nombre: string; hasta: string }[] = [];
  const avisar: { serie: SeriePorRenovar; tramo: TramoAviso; nota: string | null }[] = [];
  let fallidas = 0;

  for (const s of series) {
    let nota: string | null = null;
    if (s.renovacionAutomatica && !s.terminada) {
      const { data: respuesta, error: errorRpc } = await admin.rpc('renovar_serie', {
        p_studio_id: studioId, p_serie_id: s.serieId, p_periodo_visto: s.periodo, p_semanas: null,
        p_actor: null, p_origen: 'automatica', p_simular: false,
      });
      const r = errorRpc ? null : resultadoDeRpc(respuesta);
      if (r?.estado === 'renovada') {
        renovadas.push({ nombre: nombre(s), hasta: r.hasta });
        await reservarPlazasFijasRenovadas(admin, respuesta);
        continue;
      }
      if (r?.estado === 'ya_renovada') continue;
      // Se quitó la automática (o se marcó «no renovar») entre la lista y la
      // renovación: no es un fallo, sigue como una serie normal.
      if (!errorRpc?.message.includes('SIN_RENOVACION_AUTOMATICA')) {
        fallidas++;
        nota = errorRpc
          ? mensajeErrorRenovar(errorRpc.message)
          : 'esas fechas ya estaban en el calendario o la sala está ocupada';
      }
    }

    const tramo = tramoDe(diasHastaFin(hoy, s.ultimaFecha));
    if (tramo && tocaAvisar(tramo, { tramo: s.avisoTramo, fin: s.avisoFin }, s.ultimaFecha)) {
      avisar.push({ serie: s, tramo, nota });
    }
  }

  let avisadas = 0;
  if (avisar.length > 0) {
    const tramos = avisar.map(a => a.tramo);
    const creado = await emitirSeriesPorTerminar(admin, {
      studioId, fecha: hoy, urgente: esUrgente(tramos),
      resumen: resumenAviso(tramos),
      lista: listaAviso(avisar.map(a => ({ nombre: nombre(a.serie), fin: a.serie.ultimaFecha, hoy, nota: a.nota }))),
    });
    // Sin aviso creado no se marca nada: mañana se vuelve a intentar.
    if (creado) {
      avisadas = avisar.length;
      for (const a of avisar) {
        const { error: errorMarca } = await admin.from('series')
          .update({ aviso_tramo: a.tramo, aviso_fin: a.serie.ultimaFecha })
          .eq('id', a.serie.serieId).eq('studio_id', studioId);
        if (errorMarca) console.error('[series-renovacion] guardando el aviso', a.serie.serieId, errorMarca.message);
      }
    }
  }

  if (renovadas.length > 0) {
    await emitirSeriesRenovadasSolas(admin, {
      studioId, fecha: hoy,
      resumen: resumenRenovadas(renovadas.length),
      lista: renovadas.slice(0, 3).map(r => `${r.nombre}: hasta el ${fechaDMY(r.hasta)}`)
        .concat(renovadas.length > 3 ? [`y ${renovadas.length - 3} más`] : [])
        .join(' · '),
    });
  }

  return { renovadas: renovadas.length, avisadas, fallidas };
}
