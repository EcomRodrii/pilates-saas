// /interno → Apps de estudio: la cola de «Pedir mi app». Lógica pura y client-safe (imports
// relativos con extensión: la ejecuta `node --test`).

import { esEstadoApp, urlTiendaValida, type EstadoApp } from '../app-nativa/pedir-app.ts';

export interface CambioApp {
  studioId: string;
  estado?: EstadoApp;
  activa?: boolean;
  /** `null` borra el enlace. */
  urlTienda?: string | null;
  notaInterna?: string | null;
}

export type ResultadoCambio = { ok: true; cambio: CambioApp } | { ok: false; error: string };

const MAX_NOTA = 2000;

/**
 * Valida lo que llega del navegador. Reglas de negocio que viven AQUÍ y no en la pantalla:
 *  · `PUBLICADA` exige un enlace de la App Store (sin él, el panel del estudio enseñaría «Publicada»
 *    sin nada que abrir);
 *  · el enlace tiene que ser de apps.apple.com;
 *  · hay que cambiar algo.
 */
export function leerCambio(entrada: unknown, urlActual: string | null = null): ResultadoCambio {
  if (!entrada || typeof entrada !== 'object') return { ok: false, error: 'Petición no válida.' };
  const o = entrada as Record<string, unknown>;
  if (typeof o.studioId !== 'string' || !o.studioId) return { ok: false, error: 'Falta el estudio.' };
  const cambio: CambioApp = { studioId: o.studioId };

  if ('estado' in o) {
    if (!esEstadoApp(o.estado)) return { ok: false, error: 'Estado no válido.' };
    cambio.estado = o.estado;
  }
  if ('activa' in o) {
    if (typeof o.activa !== 'boolean') return { ok: false, error: 'Activa no válida.' };
    cambio.activa = o.activa;
  }
  if ('urlTienda' in o) {
    if (o.urlTienda === null || o.urlTienda === '') cambio.urlTienda = null;
    else if (urlTiendaValida(o.urlTienda)) cambio.urlTienda = o.urlTienda;
    else return { ok: false, error: 'El enlace tiene que ser de la App Store (https://apps.apple.com/…).' };
  }
  if ('notaInterna' in o) {
    if (o.notaInterna !== null && (typeof o.notaInterna !== 'string' || o.notaInterna.length > MAX_NOTA)) return { ok: false, error: 'Nota no válida.' };
    cambio.notaInterna = typeof o.notaInterna === 'string' && o.notaInterna.trim() ? o.notaInterna.trim() : null;
  }

  if (cambio.estado === undefined && cambio.activa === undefined && cambio.urlTienda === undefined && cambio.notaInterna === undefined) {
    return { ok: false, error: 'No hay nada que cambiar.' };
  }
  const urlFinal = cambio.urlTienda !== undefined ? cambio.urlTienda : urlActual;
  if (cambio.estado === 'PUBLICADA' && !urlFinal) return { ok: false, error: 'Para marcarla Publicada hace falta el enlace de la App Store.' };
  return { ok: true, cambio };
}

/** Las columnas de `apps_estudio` que cambia un `CambioApp` (nada más). */
export function columnasDeCambio(c: CambioApp): Record<string, unknown> {
  return {
    ...(c.estado !== undefined ? { estado: c.estado } : {}),
    ...(c.activa !== undefined ? { activa: c.activa } : {}),
    ...(c.urlTienda !== undefined ? { url_tienda: c.urlTienda } : {}),
    ...(c.notaInterna !== undefined ? { nota_interna: c.notaInterna } : {}),
  };
}

/** Qué se ve primero en la cola: lo pedido sin tramitar, luego lo que está en marcha, luego lo cerrado. */
const ORDEN: Record<EstadoApp, number> = { PEDIDA: 0, EN_PREPARACION: 1, EN_PRUEBAS: 2, EN_REVISION: 3, PAUSADA: 4, PUBLICADA: 5 };
export const ordenCola = (a: { estado: EstadoApp; pedidaEn: string | null }, b: { estado: EstadoApp; pedidaEn: string | null }) =>
  ORDEN[a.estado] - ORDEN[b.estado] || (a.pedidaEn ?? '').localeCompare(b.pedidaEn ?? '');
