// /interno → Apps de estudio: la cola de «Pedir mi app». Lógica pura y client-safe (imports
// relativos con extensión: la ejecuta `node --test`).

import { esEstadoApp, urlTiendaValida, validarNombreApp, type EstadoApp } from '../app-nativa/pedir-app.ts';

export interface CambioApp {
  studioId: string;
  estado?: EstadoApp;
  activa?: boolean;
  /** `null` borra el enlace. */
  urlTienda?: string | null;
  notaInterna?: string | null;
  /** El nombre bajo el icono y en la App Store (si el que pidió ya estaba cogido en la tienda). */
  nombreApp?: string;
}

/** Cómo está la app antes del cambio: las reglas miran el resultado, no solo lo que llega. */
export interface AppActual { estado: EstadoApp; activa: boolean; urlTienda: string | null }

export type ResultadoCambio = { ok: true; cambio: CambioApp } | { ok: false; error: string };

const MAX_NOTA = 2000;

/** El orden del camino normal. Hacia delante se puede saltar (la automatización lo hace). */
const PASO: Record<EstadoApp, number> = { PEDIDA: 0, EN_PREPARACION: 1, EN_PRUEBAS: 2, EN_REVISION: 3, PUBLICADA: 4, PAUSADA: 5 };

/**
 * ¿Se puede pasar de `de` a `a`? Hacia delante, siempre; a PAUSADA, desde cualquiera; y hacia
 * atrás solo lo que pasa de verdad: Apple la rechaza (EN_REVISION → EN_PRUEBAS) o hay que rehacer
 * la compilación (EN_PRUEBAS → EN_PREPARACION). Una pausada se retoma en cualquier punto menos
 * «Pedida». Una publicada no vuelve atrás: una versión nueva en revisión sigue publicada.
 */
export function transicionPermitida(de: EstadoApp, a: EstadoApp): boolean {
  if (de === a) return true;
  if (a === 'PAUSADA') return true;
  if (de === 'PAUSADA') return a !== 'PEDIDA';
  if (de === 'PUBLICADA') return false;
  if (PASO[a] > PASO[de]) return true;
  return (de === 'EN_REVISION' && a === 'EN_PRUEBAS') || (de === 'EN_PRUEBAS' && a === 'EN_PREPARACION');
}

/**
 * Valida lo que llega del navegador contra cómo está la app. Reglas de negocio que viven AQUÍ y no
 * en la pantalla, y se aplican al RESULTADO (estado, activa y enlace después del cambio):
 *  · solo transiciones de verdad (`transicionPermitida`);
 *  · `PUBLICADA` exige el enlace de la ficha de la App Store y la app activa (sin ellos, el panel
 *    del estudio diría «Publicada» sin nada que abrir, o la app instalada no abriría su estudio);
 *  · `activa` no se enciende con la app solo «Pedida» (aún no existe en App Store Connect);
 *  · el nombre, con las mismas reglas que al pedirla;
 *  · hay que cambiar algo.
 */
export function leerCambio(entrada: unknown, actual: AppActual): ResultadoCambio {
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
    else return { ok: false, error: 'El enlace tiene que ser el de la ficha de la app en la App Store (https://apps.apple.com/es/app/…/id…).' };
  }
  if ('notaInterna' in o) {
    if (o.notaInterna !== null && (typeof o.notaInterna !== 'string' || o.notaInterna.length > MAX_NOTA)) return { ok: false, error: 'Nota no válida.' };
    cambio.notaInterna = typeof o.notaInterna === 'string' && o.notaInterna.trim() ? o.notaInterna.trim() : null;
  }
  if ('nombreApp' in o) {
    const n = validarNombreApp(o.nombreApp);
    if (!n.ok) return { ok: false, error: n.error };
    cambio.nombreApp = n.nombre;
  }

  if (cambio.estado === undefined && cambio.activa === undefined && cambio.urlTienda === undefined
    && cambio.notaInterna === undefined && cambio.nombreApp === undefined) {
    return { ok: false, error: 'No hay nada que cambiar.' };
  }

  const estado = cambio.estado ?? actual.estado;
  const activa = cambio.activa ?? actual.activa;
  const url = cambio.urlTienda !== undefined ? cambio.urlTienda : actual.urlTienda;
  if (!transicionPermitida(actual.estado, estado)) {
    return { ok: false, error: `No se puede pasar de «${actual.estado}» a «${estado}».` };
  }
  if (estado === 'PUBLICADA' && !url) return { ok: false, error: 'Una app publicada necesita el enlace de la App Store.' };
  if (estado === 'PUBLICADA' && !activa) return { ok: false, error: 'Una app publicada tiene que estar activa: si no, no abre su estudio.' };
  if (activa && estado === 'PEDIDA') return { ok: false, error: 'Antes de activarla, pásala a «En preparación»: aún no existe en App Store Connect.' };
  return { ok: true, cambio };
}

/** Las columnas de `apps_estudio` que cambia un `CambioApp` (nada más). */
export function columnasDeCambio(c: CambioApp): Record<string, unknown> {
  return {
    ...(c.estado !== undefined ? { estado: c.estado } : {}),
    ...(c.activa !== undefined ? { activa: c.activa } : {}),
    ...(c.urlTienda !== undefined ? { url_tienda: c.urlTienda } : {}),
    ...(c.notaInterna !== undefined ? { nota_interna: c.notaInterna } : {}),
    ...(c.nombreApp !== undefined ? { nombre_app: c.nombreApp } : {}),
  };
}

/** Qué se ve primero en la cola: lo pedido sin tramitar, luego lo que está en marcha, luego lo cerrado. */
const ORDEN: Record<EstadoApp, number> = { PEDIDA: 0, EN_PREPARACION: 1, EN_PRUEBAS: 2, EN_REVISION: 3, PAUSADA: 4, PUBLICADA: 5 };
export const ordenCola = (a: { estado: EstadoApp; pedidaEn: string | null }, b: { estado: EstadoApp; pedidaEn: string | null }) =>
  ORDEN[a.estado] - ORDEN[b.estado] || (a.pedidaEn ?? '').localeCompare(b.pedidaEn ?? '');
