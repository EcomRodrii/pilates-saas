// ─────────────────────────────────────────────────────────────────────────────
// Módulo Festivos: leer y escribir lo que el estudio ha guardado
// (`festivos_estudio`, migr 20261014183358) y la lista que ve: los oficiales de
// su zona (del código, nunca guardados) más lo guardado, con lo que ya decidió
// de cada día (un cierre o «abrimos igualmente»).
//
// Va con service-role: el llamador comprueba el rol (`puedeGestionarSede`) y el
// interruptor, y pasa el estudio de la SESIÓN, nunca del cliente. Cada consulta
// filtra por él. Imports relativos con `.ts` para probarlo con un cliente falso
// (estudio-servidor.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { esTablaQueFalta } from '../db/tabla-que-falta.ts';
import type { ZonaFestivos } from './oficiales.ts';
import { zonaDelEstudio } from './zona-del-estudio.ts';
import { dominioDe, oficialesDeLaLista, rangoDeLaLista, unirLista, type FilaParaGuardar } from './modulo.ts';
import type { Ambito, FestivoDeLaLista, Origen } from './lista.ts';

type Fallo = 'no_disponible' | 'error';
/** Lo que guarda un estudio es poco (dos locales al año y algún día propio): esto es un tope de seguridad. */
const MAX_GUARDADOS = 500;

function fallo(error: { code?: string; message?: string }, donde: string): Fallo {
  if (esTablaQueFalta(error)) return 'no_disponible';
  console.error(`[festivos-estudio:${donde}]`, error);
  return 'error';
}

export interface UbicacionEstudio { codigoPostal: string | null; ciudad: string | null; direccion: string | null; zonaHoraria: string | null }

/** Dónde está el estudio (para la zona de sus oficiales y para rellenar «Tu localidad»). */
export async function ubicacionDelEstudio(admin: SupabaseClient, studioId: string): Promise<UbicacionEstudio | 'error'> {
  const { data, error } = await admin.from('studios')
    .select('codigo_postal, ciudad, direccion, zona_horaria').eq('id', studioId).maybeSingle();
  if (error) {
    console.error('[festivos-estudio:ubicacion]', error);
    return 'error';
  }
  return {
    codigoPostal: (data?.codigo_postal as string | null) ?? null,
    ciudad: (data?.ciudad as string | null) ?? null,
    direccion: (data?.direccion as string | null) ?? null,
    zonaHoraria: (data?.zona_horaria as string | null) ?? null,
  };
}

export const zonaDeUbicacion = (u: UbicacionEstudio): ZonaFestivos | null => zonaDelEstudio(u);

/**
 * Los festivos GUARDADOS de un rango (para la bandeja y «Repetir este mes»).
 * ⚠️ Sin la tabla (migración sin aplicar) es una lista VACÍA, no un fallo: el
 * aviso de los oficiales y Repetir tienen que seguir como antes.
 */
export async function festivosGuardadosEntre(
  admin: SupabaseClient, studioId: string, desde: string, hasta: string | null,
): Promise<{ fecha: string; nombre: string; origen: 'ia' | 'manual' }[] | 'error'> {
  let q = admin.from('festivos_estudio').select('fecha, nombre, origen').eq('studio_id', studioId).gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q.order('fecha').limit(MAX_GUARDADOS);
  if (error) {
    if (esTablaQueFalta(error)) return [];
    console.error('[festivos-estudio:rango]', error);
    return 'error';
  }
  return (data ?? []).map((f) => ({ fecha: String(f.fecha).slice(0, 10), nombre: String(f.nombre), origen: f.origen === 'ia' ? 'ia' as const : 'manual' as const }));
}

/**
 * La lista que ve el estudio: los oficiales de su zona (de este año al último
 * cargado) y lo que ha guardado, con lo que ya decidió de cada día.
 */
export async function listaDelEstudio(
  admin: SupabaseClient, studioId: string, zona: ZonaFestivos | null, hoy: string,
): Promise<FestivoDeLaLista[] | Fallo> {
  const rango = rangoDeLaLista(hoy, zona);
  const { data, error } = await admin.from('festivos_estudio')
    .select('id, fecha, nombre, ambito, origen, fuente_url')
    .eq('studio_id', studioId).gte('fecha', rango.desde).order('fecha').limit(MAX_GUARDADOS);
  if (error) return fallo(error, 'lista');
  const guardados: FestivoDeLaLista[] = (data ?? []).map((f) => {
    const fuenteUrl = (f.fuente_url as string | null) ?? null;
    return {
      id: String(f.id),
      fecha: String(f.fecha).slice(0, 10),
      nombre: String(f.nombre),
      ambito: f.ambito as Ambito,
      origen: f.origen as Origen,
      fuente: dominioDe(fuenteUrl),
      fuenteUrl,
      estado: null,
    };
  });
  const lista = unirLista(zona ? oficialesDeLaLista(zona, rango.desde, rango.hasta) : [], guardados);
  if (lista.length === 0) return [];

  const desde = lista[0].fecha;
  const hasta = lista[lista.length - 1].fecha;
  const [cierres, abiertos] = await Promise.all([
    admin.from('cierres_estudio').select('desde, hasta').eq('studio_id', studioId).lte('desde', hasta).gte('hasta', desde),
    admin.from('festivos_abiertos').select('fecha').eq('studio_id', studioId).gte('fecha', desde).lte('fecha', hasta),
  ]);
  if (cierres.error) return fallo(cierres.error, 'cierres');
  // Sin la tabla de «abrimos» no hay nada abierto: no es un error.
  if (abiertos.error && !esTablaQueFalta(abiertos.error)) return fallo(abiertos.error, 'abiertos');
  const rangos = (cierres.data ?? []).map((c) => ({ desde: String(c.desde).slice(0, 10), hasta: String(c.hasta).slice(0, 10) }));
  const abiertas = new Set((abiertos.data ?? []).map((a) => String(a.fecha).slice(0, 10)));
  return lista.map((f) => ({
    ...f,
    estado: rangos.some((c) => c.desde <= f.fecha && f.fecha <= c.hasta) ? 'cerrado' as const : abiertas.has(f.fecha) ? 'abierto' as const : null,
  }));
}

/**
 * Guardar en lote. Idempotente: un día que ya estaba no se duplica ni falla
 * (UNIQUE studio_id+fecha), y se cuenta aparte para decirlo.
 */
export async function guardarFestivos(
  admin: SupabaseClient, studioId: string, userId: string | null, filas: FilaParaGuardar[],
): Promise<{ creados: string[]; yaEstaban: number } | Fallo> {
  const { data, error } = await admin.from('festivos_estudio').upsert(
    filas.map((f) => ({ ...f, studio_id: studioId, creado_por: userId })),
    { onConflict: 'studio_id,fecha', ignoreDuplicates: true },
  ).select('fecha');
  if (error) return fallo(error, 'guardar');
  const creados = (data ?? []).map((f) => String(f.fecha).slice(0, 10));
  return { creados, yaEstaban: filas.length - creados.length };
}

/** Quitar de la lista. Solo borra la fila (del estudio de la sesión): un cierre de ese día sigue como estaba. */
export async function quitarFestivos(admin: SupabaseClient, studioId: string, ids: string[]): Promise<number | Fallo> {
  const { data, error } = await admin.from('festivos_estudio').delete()
    .eq('studio_id', studioId).in('id', ids).select('id');
  if (error) return fallo(error, 'quitar');
  return (data ?? []).length;
}
