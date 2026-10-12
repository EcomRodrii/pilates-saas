// ─────────────────────────────────────────────────────────────────────────────
// «Repetir este mes» en el servidor: proponer (simular cada serie hasta el
// último día del mes siguiente) y crear (solo las fechas marcadas). Todo pasa
// por `renovar_serie` con `p_hasta`/`p_fechas` (migr 20261012210100); aquí no
// se decide qué clase se crea ni cuál se omite.
//
// Va con service-role: la ruta comprueba el rol y pasa el estudio de la SESIÓN.
// Imports relativos con `.ts` (sin `@/`) para probarlo con `node --test` y un
// cliente falso (repetir-mes-servidor.test.ts).
//
// Un error de lectura nunca se convierte en dato: si no se puede saber la zona
// del estudio o las clases del mes, la propuesta falla (500) en vez de proponer
// sin festivos o con una serie mal marcada.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapLimit } from '../concurrency.ts';
import { finDelDiaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';
import { mensajeErrorRenovar, resultadoDeRpc } from '../series-renovacion.ts';
import { reservarPlazasFijasRenovadas } from './plazas-tras-renovar.ts';
import { esTablaQueFalta } from '../db/tabla-que-falta.ts';
import { festivosEntre, hayCalendario, NOMBRE_ZONA } from '../festivos/oficiales.ts';
import { zonaDelEstudio } from '../festivos/zona-del-estudio.ts';
import {
  mesSiguiente, primerDia, serieTerminada, ultimoDia,
  type PropuestaRepetir, type ResultadoRepetir, type SerieParaRepetir,
} from './repetir-mes.ts';

const TZ = 'Europe/Madrid';
export const MAX_SERIES = 60;
export const MAX_FECHAS = 600;

/** PostgREST no encuentra la firma nueva: la migración no está aplicada. */
function rpcSinFirmaNueva(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? ''));
}

let sondaCache: { ok: boolean; hasta: number } | null = null;

/**
 * ¿Está aplicada la migración? Una llamada con una serie que no existe tiene
 * que contestar SERIE_NO_ENCONTRADA (la función con `p_hasta` existe), no
 * PGRST202. El «sí» se recuerda 10 minutos; el «no», uno (un fallo pasajero no
 * esconde el botón mucho rato).
 */
export async function repetirDisponible(admin: SupabaseClient, studioId: string): Promise<boolean> {
  if (sondaCache && sondaCache.hasta > Date.now()) return sondaCache.ok;
  const { error } = await admin.rpc('renovar_serie', {
    p_studio_id: studioId, p_serie_id: '__sonda_repetir_mes__', p_periodo_visto: null, p_semanas: null,
    p_origen: 'manual', p_simular: true, p_hasta: hoyEnEstudio(), p_fechas: null,
  });
  const ok = !!error && /SERIE_NO_ENCONTRADA/.test(error.message ?? '') && !rpcSinFirmaNueva(error);
  sondaCache = { ok, hasta: Date.now() + (ok ? 10 : 1) * 60_000 };
  return ok;
}

/** Solo para los tests. */
export function olvidarSonda() { sondaCache = null; }

interface FilaSesion { serie_id: string | null; inicio: string; tipo_clase_id: string | null; sala_id: string | null; cancelada: boolean | null }

// Uno para todo el módulo: crear un Intl por llamada es caro (medido en este repo).
const FORMATO_DIA_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const diaYHora = (iso: string) => {
  const partes = FORMATO_DIA_HORA.formatToParts(new Date(iso));
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.find((p) => p.type === 'weekday')?.value ?? '');
  const hora = `${partes.find((p) => p.type === 'hour')?.value}:${partes.find((p) => p.type === 'minute')?.value}`;
  return { dia, hora };
};

export async function proponerRepetir(
  admin: SupabaseClient, studioId: string, mes: string,
): Promise<{ ok: true; propuesta: PropuestaRepetir } | { ok: false; error: string; status: number }> {
  const hoy = hoyEnEstudio();
  const destino = mesSiguiente(mes);
  const hasta = ultimoDia(destino);
  const finMes = ultimoDia(mes);
  if (hasta <= hoy) return { ok: false, error: 'Ese mes ya ha pasado.', status: 400 };

  // La zona del estudio (para los festivos). Un error aquí no es «sin zona».
  const { data: estudio, error: errEstudio } = await admin.from('studios')
    .select('codigo_postal, ciudad, direccion, zona_horaria').eq('id', studioId).maybeSingle();
  if (errEstudio) return { ok: false, error: 'No se ha podido leer tu estudio.', status: 500 };
  const zona = estudio ? zonaDelEstudio({
    codigoPostal: estudio.codigo_postal as string | null, ciudad: estudio.ciudad as string | null,
    direccion: estudio.direccion as string | null, zonaHoraria: estudio.zona_horaria as string | null,
  }) : null;

  // Las clases del mes, por días del ESTUDIO (no UTC). Con las canceladas: un
  // mes cerrado entero (agosto) también tiene que poder repetirse.
  const filas: FilaSesion[] = [];
  let sueltas = 0;
  for (let desde = 0; desde < 5000; desde += 1000) {
    const { data, error } = await admin.from('sesiones')
      .select('serie_id, inicio, tipo_clase_id, sala_id, cancelada')
      .eq('studio_id', studioId)
      .gte('inicio', inicioDelDiaEstudio(primerDia(mes))).lt('inicio', finDelDiaEstudio(finMes))
      .order('inicio').range(desde, desde + 999);
    if (error) return { ok: false, error: 'No se han podido leer las clases del mes.', status: 500 };
    for (const f of (data ?? []) as FilaSesion[]) {
      if (f.serie_id) filas.push(f);
      else if (!f.cancelada) sueltas += 1;
    }
    if ((data ?? []).length < 1000) break;
  }

  const porSerie = new Map<string, FilaSesion[]>();
  for (const f of filas) porSerie.set(f.serie_id as string, [...(porSerie.get(f.serie_id as string) ?? []), f]);
  const todas = [...porSerie.keys()];
  const ids = todas.slice(0, MAX_SERIES);

  const { data: series, error: errSeries } = ids.length
    ? await admin.from('series').select('id, no_renovar').eq('studio_id', studioId).in('id', ids)
    : { data: [], error: null };
  if (errSeries) return { ok: false, error: 'No se han podido leer las clases del mes.', status: 500 };
  const noRenovar = new Map((series ?? []).map((s) => [s.id as string, s.no_renovar === true]));

  // Festivos de la zona desde HOY (una serie aún puede tener clase hoy) hasta el
  // final del mes siguiente, y los del mes de origen para decir si una serie
  // «terminó» o solo no tuvo clase un festivo.
  const festivosOrigen = new Set(zona ? festivosEntre(zona, primerDia(mes), finMes).map((f) => f.fecha) : []);
  const festivos = zona ? festivosEntre(zona, hoy, hasta).map((f) => ({ fecha: f.fecha, nombre: f.nombre })) : [];
  const aniosSinFestivos = zona
    ? [...new Set([hoy.slice(0, 4), hasta.slice(0, 4)])].map(Number).filter((a) => !hayCalendario(zona, `${a}-01-01`))
    : [];

  const simuladas = await mapLimit(ids, 4, async (serieId): Promise<SerieParaRepetir | null> => {
    const filasSerie = porSerie.get(serieId) ?? [];
    const vivas = filasSerie.filter((f) => !f.cancelada);
    const referencia = vivas.length ? vivas : filasSerie;
    const ultima = referencia[referencia.length - 1];
    const base = {
      serieId, tipoClaseId: ultima?.tipo_clase_id ?? null, salaId: ultima?.sala_id ?? null,
      dias: [...new Set(filasSerie.map((f) => diaYHora(f.inicio).dia))],
      hora: ultima ? diaYHora(ultima.inicio).hora : '',
      sinInstructora: 0, instructoraInactiva: false,
    };
    const { data, error } = await admin.rpc('renovar_serie', {
      p_studio_id: studioId, p_serie_id: serieId, p_periodo_visto: null, p_semanas: null,
      p_origen: 'manual', p_simular: true, p_hasta: hasta, p_fechas: null,
    });
    if (rpcSinFirmaNueva(error)) return null;
    if (error) {
      // El texto de renovar dice «para renovarla»; aquí se repite.
      const texto = mensajeErrorRenovar(error.message).replace('para renovarla', 'para repetirla');
      return { ...base, periodoVisto: 0, fechas: [], bloqueadas: [], desmarcadaPor: null, error: texto };
    }
    const r = resultadoDeRpc(data);
    if (!r) return { ...base, periodoVisto: 0, fechas: [], bloqueadas: [], desmarcadaPor: null, error: 'No se ha podido preparar esta clase.' };
    const fechas = r.fechas ?? [];
    const bloqueadas = r.omitidas.filter((o) => o.motivo !== 'excluida' && o.motivo !== 'fuera_de_serie');
    const desmarcadaPor = noRenovar.get(serieId) ? 'no_renovar' as const
      // Todas sus clases del mes canceladas: o el centro cerró (y entonces se
      // marca a mano) o se cancelaron a propósito. No se resucita sola.
      : vivas.length === 0 ? 'canceladas' as const
        : serieTerminada({ fechas, bloqueadas }, finMes, festivosOrigen) ? 'terminada' as const
          : null;
    return {
      ...base,
      periodoVisto: r.periodoActual ?? r.periodo - 1,
      fechas, bloqueadas, desmarcadaPor, error: null,
      sinInstructora: r.sinInstructora.length,
      instructoraInactiva: r.instructoraInactiva,
    };
  });
  if (simuladas.some((s) => s === null)) return { ok: false, error: 'No disponible', status: 404 };

  let abiertos: string[] = [];
  if (festivos.length > 0) {
    const { data, error } = await admin.from('festivos_abiertos').select('fecha')
      .eq('studio_id', studioId).gte('fecha', festivos[0].fecha).lte('fecha', hasta);
    if (error && !esTablaQueFalta(error)) return { ok: false, error: 'No se han podido leer los festivos.', status: 500 };
    abiertos = (data ?? []).map((f) => String(f.fecha).slice(0, 10));
  }

  return {
    ok: true,
    propuesta: {
      mes, destino, hoy, zona: zona ? NOMBRE_ZONA[zona] : null, festivos, abiertos,
      series: simuladas as SerieParaRepetir[], sueltas, seriesFuera: todas.length - ids.length, aniosSinFestivos,
    },
  };
}

export async function crearRepetir(
  admin: SupabaseClient, studioId: string, userId: string, mes: string,
  plan: { serieId: string; periodoVisto: number; fechas: string[] }[],
): Promise<ResultadoRepetir> {
  const hasta = ultimoDia(mesSiguiente(mes));
  let creadas = 0;
  let fallidas = 0;
  let pedidasFallidas = 0;
  let sinInstructora = 0;
  const ids: string[] = [];
  let primeraFecha: string | null = null;
  const pedidas = plan.reduce((n, s) => n + s.fechas.length, 0);

  // Una a una: cada serie es su propia transacción (y su propio candado). Si una
  // falla, las demás siguen; el resumen dice cuántas no salieron.
  for (const s of plan) {
    try {
      const { data, error } = await admin.rpc('renovar_serie', {
        p_studio_id: studioId, p_serie_id: s.serieId, p_periodo_visto: s.periodoVisto, p_semanas: null,
        p_actor: userId, p_origen: 'manual', p_simular: false, p_hasta: hasta, p_fechas: s.fechas,
      });
      if (error) {
        fallidas += 1;
        pedidasFallidas += s.fechas.length;
        console.error('[repetir-mes]', s.serieId, error.message);
        continue;
      }
      const r = resultadoDeRpc(data);
      // 'ya_renovada' (alguien la alargó mientras tanto) no suma nada.
      if (!r || r.estado !== 'renovada') continue;
      creadas += r.creadas;
      sinInstructora += r.sinInstructora.length;
      ids.push(...(r.creadasIds ?? []));
      const omitidas = new Set(r.omitidas.map((o) => o.fecha));
      for (const f of s.fechas) if (!omitidas.has(f) && (!primeraFecha || f < primeraFecha)) primeraFecha = f;
      await reservarPlazasFijasRenovadas(admin, data);
    } catch (e) {
      fallidas += 1;
      pedidasFallidas += s.fechas.length;
      console.error('[repetir-mes]', s.serieId, e);
    }
  }
  return { creadas, ids, primeraFecha, fallidas, pedidasFallidas, pedidas, sinInstructora };
}
