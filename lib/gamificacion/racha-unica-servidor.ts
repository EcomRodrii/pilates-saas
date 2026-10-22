// Carga de datos de la RACHA ÚNICA (PR 3.3, detrás de `RACHA_UNICA`): lee de la base lo que
// necesita `calcularRachaUnica` y se lo da. Lo llaman las TRES salidas del servidor —la ruta de la
// app de la alumna (`/api/public/racha`), el logro «Semanas consecutivas» y, en el PR siguiente, el
// pago de «semana completa»—, para que el número sea el mismo en todas: una sola carga, una sola
// función. Sin `@/` ni `server-only` a propósito: recibe el cliente ya creado y se prueba con
// `node --test`.
//
// ⚠️ Corre con service-role: TODA consulta filtra por `studio_id` Y, las de la alumna, por `socio_id`
// (lo exige `racha-unica-contrato.test.ts`). La identidad la pone quien llama (token verificado),
// nunca el cuerpo de una petición.

import {
  calcularRachaUnica, semanasCandidatasSinClases,
  type HechoClase, type RachaUnica, type RangoFechas,
} from '../engines/streak-engine.ts';
import { inicioDelDiaEstudio, masDias } from '../utils.ts';

// Lo mínimo del cliente de Supabase que se usa (permite un doble en los tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (tabla: string) => any };

/** Tope de consultas «¿ofreció clases el estudio esa semana?»: solo las semanas sin otra explicación. */
const MAX_SEMANAS_A_PREGUNTAR = 156; // ~3 años; más allá, la semana sin explicación cuenta como fallida
const TROZO = 120;
// El pase de lista trae TODAS las asistidas de cada clase y PostgREST corta en 1000 filas: trozos pequeños para no truncar en silencio.
const TROZO_LISTA = 25;
const EN_PARALELO = 10;

function trozos<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

interface FilaReserva { sesion_id: string; estado: string; cancelada_tardia: boolean | null }
interface FilaSesion { id: string; inicio: string; cancelada: boolean | null }

export interface FilasRacha {
  reservas: FilaReserva[];
  sesiones: FilaSesion[];
  /** Sesiones (de las de la alumna) en las que alguien figura `ASISTIDA`. */
  sesionesConLista: ReadonlySet<string>;
  cierres: RangoFechas[];
  pausas: RangoFechas[];
}

/** De filas de la base a la forma del motor. Puro. */
export function hechosDeFilas(f: FilasRacha): HechoClase[] {
  const sesionPorId = new Map(f.sesiones.map((s) => [s.id, s]));
  const out: HechoClase[] = [];
  for (const r of f.reservas) {
    const s = sesionPorId.get(r.sesion_id);
    if (!s) continue;
    out.push({
      inicio: s.inicio,
      estado: r.estado as HechoClase['estado'],
      sesionCancelada: !!s.cancelada,
      canceladaTardia: r.cancelada_tardia,
      sesionConLista: f.sesionesConLista.has(s.id),
    });
  }
  return out;
}

async function leer<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>, que: string): Promise<T[]> {
  const { data, error } = await q;
  // Un fallo de lectura NO es «sin datos»: una racha de 0 inventada por un error de red sería mentir.
  if (error) throw new Error(`racha-unica: no se pudo leer ${que}`);
  return data ?? [];
}

export async function cargarRachaUnica(
  admin: Admin, studioId: string, socioId: string, now: Date = new Date(),
): Promise<RachaUnica> {
  const reservas = await leer<FilaReserva>(
    admin.from('reservas').select('sesion_id, estado, cancelada_tardia').eq('studio_id', studioId).eq('socio_id', socioId),
    'las reservas',
  );
  const idsSesion = [...new Set(reservas.map((r) => r.sesion_id))];

  const sesiones = (await Promise.all(trozos(idsSesion, TROZO).map((ids) => leer<FilaSesion>(
    admin.from('sesiones').select('id, inicio, cancelada').eq('studio_id', studioId).in('id', ids), 'las clases',
  )))).flat();

  // «Se pasó lista» solo importa donde hay un no-show o una reserva sin resolver.
  const inicioPorSesion = new Map(sesiones.map((x) => [x.id, x.inicio]));
  const dudosas = [...new Set(reservas
    .filter((r) => r.estado === 'NO_ASISTIO' || (r.estado === 'CONFIRMADA' && new Date(inicioPorSesion.get(r.sesion_id) ?? 0) <= now))
    .map((r) => r.sesion_id))];
  const conLista = new Set<string>();
  for (const ids of trozos(dudosas, TROZO_LISTA)) {
    const filas = await leer<{ sesion_id: string }>(
      admin.from('reservas').select('sesion_id').eq('studio_id', studioId).eq('estado', 'ASISTIDA').in('sesion_id', ids),
      'el pase de lista',
    );
    for (const f of filas) conLista.add(f.sesion_id);
  }

  const [cierresRows, subs, plazas] = await Promise.all([
    leer<{ desde: string; hasta: string }>(admin.from('cierres_estudio').select('desde, hasta').eq('studio_id', studioId), 'los cierres'),
    leer<{ id: string }>(admin.from('suscripciones').select('id').eq('studio_id', studioId).eq('socio_id', socioId), 'sus cuotas'),
    leer<{ pausa_desde: string | null; pausa_hasta: string | null }>(
      admin.from('plazas_fijas').select('pausa_desde, pausa_hasta').eq('studio_id', studioId).eq('socio_id', socioId).not('pausa_desde', 'is', null),
      'sus plazas fijas',
    ),
  ]);
  const congelaciones = (await Promise.all(trozos(subs.map((s) => s.id), TROZO).map((ids) => leer<{ desde: string; hasta: string | null }>(
    admin.from('congelaciones').select('desde, hasta').eq('studio_id', studioId).in('suscripcion_id', ids), 'sus congelaciones',
  )))).flat();

  const base = {
    clases: hechosDeFilas({
      reservas, sesiones, sesionesConLista: conLista, cierres: [], pausas: [],
    }),
    cierres: cierresRows.map((c) => ({ desde: c.desde, hasta: c.hasta })),
    pausas: [
      ...congelaciones.map((c) => ({ desde: c.desde, hasta: c.hasta })),
      ...plazas.filter((p) => p.pausa_desde).map((p) => ({ desde: p.pausa_desde as string, hasta: p.pausa_hasta })),
    ],
    now,
  };

  // ¿Ofreció el estudio alguna clase esa semana? Solo se pregunta por las semanas que ninguna otra
  // causa explica (no por todo el año): una consulta de recuento por semana, sin traer filas.
  const candidatas = semanasCandidatasSinClases(base).slice(-MAX_SEMANAS_A_PREGUNTAR);
  const sinClases = new Set<string>();
  for (const lote of trozos(candidatas, EN_PARALELO)) {
    await Promise.all(lote.map(async (lunes) => {
      const { count, error } = await admin.from('sesiones')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studioId).not('cancelada', 'is', true)
        .gte('inicio', inicioDelDiaEstudio(lunes)).lt('inicio', inicioDelDiaEstudio(masDias(lunes, 7)));
      if (error) throw new Error('racha-unica: no se pudo leer las clases del estudio');
      if ((count ?? 0) === 0) sinClases.add(lunes);
    }));
  }

  return calcularRachaUnica({ ...base, semanasSinClases: sinClases });
}
