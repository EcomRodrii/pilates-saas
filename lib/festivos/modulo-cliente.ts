'use client';

// Llamadas de la pantalla Festivos (panel nuevo). Nada optimista: lo que se
// pinta es lo que devuelve el servidor, y un cuerpo con otra forma se trata como
// fallo. Decidir un día (abrir / cerrar) y «Comprobar clases» reutilizan
// `festivos-cliente.ts`: el mismo camino que el aviso de la bandeja y que
// «Cerrar el centro».

import { authHeader } from '@/lib/api-client';
import type { Ambito, FestivoDeLaLista, FestivoPropuesto, Origen } from './lista';

const SIN_RED = 'No se ha podido conectar. Inténtalo de nuevo.';
const AMBITOS = new Set(['nacional', 'autonomico', 'local', 'propio']);
const ORIGENES = new Set(['oficial', 'ia', 'manual']);

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string; noDisponible?: boolean };

async function pedir(url: string, init?: RequestInit): Promise<{ res: Response; cuerpo: Record<string, unknown> | null } | null> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader()) },
  }).catch(() => null);
  if (!res) return null;
  const cuerpo = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, cuerpo };
}

function fallo(r: { res: Response; cuerpo: Record<string, unknown> | null } | null, porDefecto: string): { ok: false; error: string; noDisponible?: boolean } {
  if (!r) return { ok: false, error: SIN_RED };
  return {
    ok: false,
    error: typeof r.cuerpo?.error === 'string' ? r.cuerpo.error : porDefecto,
    noDisponible: r.res.status === 404,
  };
}

const esCadenaONull = (x: unknown) => x === null || typeof x === 'string';

function esDeLaLista(x: unknown): x is FestivoDeLaLista {
  const f = x as Record<string, unknown> | null;
  return !!f && esCadenaONull(f.id) && typeof f.fecha === 'string' && typeof f.nombre === 'string'
    && AMBITOS.has(f.ambito as string) && ORIGENES.has(f.origen as string) && esCadenaONull(f.fuente) && esCadenaONull(f.fuenteUrl)
    && (f.estado === null || f.estado === 'cerrado' || f.estado === 'abierto');
}

function esPropuesto(x: unknown): x is FestivoPropuesto {
  const f = x as Record<string, unknown> | null;
  return !!f && typeof f.fecha === 'string' && typeof f.nombre === 'string' && AMBITOS.has(f.ambito as string)
    && (f.origen === 'oficial' || f.origen === 'ia') && typeof f.yaEnLista === 'boolean'
    && esCadenaONull(f.fuente) && esCadenaONull(f.fuenteUrl);
}

export interface ListaDelEstudio {
  hoy: string;
  /** Para rellenar «Tu localidad»: la ciudad de la dirección del estudio. */
  localidad: string;
  /** «la Comunidad de Madrid», o null si no la sabemos por la dirección. */
  comunidad: string | null;
  festivos: FestivoDeLaLista[];
}

export async function leerFestivosDelEstudio(): Promise<Resultado<ListaDelEstudio>> {
  const r = await pedir('/api/festivos/estudio');
  if (!r?.res.ok) return fallo(r, 'No se han podido leer tus festivos.');
  const d = r.cuerpo;
  if (!d || typeof d.hoy !== 'string' || typeof d.localidad !== 'string' || !Array.isArray(d.festivos) || !d.festivos.every(esDeLaLista)) {
    return { ok: false, error: 'No se han podido leer tus festivos.' };
  }
  return { ok: true, datos: { hoy: d.hoy, localidad: d.localidad, comunidad: typeof d.comunidad === 'string' ? d.comunidad : null, festivos: d.festivos } };
}

export interface Busqueda {
  localidad: string;
  /** La comunidad de lo buscado (de ahí salen los oficiales), o null: entonces, los nacionales comunes. */
  comunidad: string | null;
  /** Lo buscado es de otra comunidad que la dirección del estudio (la de la dirección): se avisa. */
  otraComunidad: string | null;
  /** Años del rango sin calendario oficial de esa comunidad (lo de esos años lo busca entero la IA). */
  sinCalendario: number[];
  /** TODOS los festivos, en orden: los del boletín y los que encuentra la IA. */
  propuestos: FestivoPropuesto[];
  /** Qué pasó con la IA. */
  ia: 'ok' | 'tope' | 'error';
  avisos: string[];
}

export async function buscarFestivos(localidad: string): Promise<Resultado<Busqueda>> {
  const r = await pedir('/api/festivos/buscar', { method: 'POST', body: JSON.stringify({ localidad }) });
  if (!r?.res.ok) return fallo(r, 'No se han podido buscar los festivos. Inténtalo de nuevo.');
  const d = r.cuerpo;
  const listas = d && Array.isArray(d.propuestos) && Array.isArray(d.sinCalendario) && Array.isArray(d.avisos);
  if (!d || !listas || !(d.propuestos as unknown[]).every(esPropuesto)
    || (d.ia !== 'ok' && d.ia !== 'tope' && d.ia !== 'error') || typeof d.localidad !== 'string') {
    return { ok: false, error: 'No se han podido buscar los festivos. Inténtalo de nuevo.' };
  }
  return {
    ok: true,
    datos: {
      localidad: d.localidad,
      comunidad: typeof d.comunidad === 'string' ? d.comunidad : null,
      otraComunidad: typeof d.otraComunidad === 'string' ? d.otraComunidad : null,
      sinCalendario: (d.sinCalendario as unknown[]).filter((a): a is number => typeof a === 'number'),
      propuestos: d.propuestos as FestivoPropuesto[],
      ia: d.ia,
      avisos: (d.avisos as unknown[]).filter((a): a is string => typeof a === 'string'),
    },
  };
}

export interface FestivoParaGuardar {
  fecha: string;
  nombre: string;
  origen: Origen;
  ambito?: Ambito;
  fuenteUrl?: string | null;
}

/** `localidad`: la que se buscó (el servidor comprueba contra ella los oficiales). */
export async function guardarFestivos(festivos: FestivoParaGuardar[], localidad?: string): Promise<Resultado<{ creados: string[]; yaEstaban: number }>> {
  const r = await pedir('/api/festivos/estudio', { method: 'POST', body: JSON.stringify({ localidad, festivos }) });
  if (!r?.res.ok) return fallo(r, 'No se han podido guardar. Inténtalo de nuevo.');
  const d = r.cuerpo;
  if (!d || d.ok !== true || !Array.isArray(d.creados) || typeof d.yaEstaban !== 'number') {
    return { ok: false, error: 'No sabemos si se han guardado. Recarga la página para verlo.' };
  }
  return { ok: true, datos: { creados: (d.creados as unknown[]).filter((f): f is string => typeof f === 'string'), yaEstaban: d.yaEstaban } };
}

export async function quitarFestivos(ids: string[]): Promise<Resultado<{ quitados: number }>> {
  const r = await pedir('/api/festivos/estudio', { method: 'DELETE', body: JSON.stringify({ ids }) });
  if (!r?.res.ok) return fallo(r, 'No se han podido quitar. Inténtalo de nuevo.');
  const d = r.cuerpo;
  if (!d || d.ok !== true || typeof d.quitados !== 'number') return { ok: false, error: 'No sabemos si se han quitado. Recarga la página para verlo.' };
  return { ok: true, datos: { quitados: d.quitados } };
}
