// Lo publicado de cada widget por id (./pieza.ts), como lo usa el panel: la fila
// de `widget_piezas` que la propietaria lee por RLS, o la respuesta de
// /api/estudio/widget-pieza al aplicar. Puro, para `node --test`.

import { MAX_ANTERIORES, claveDeCopia, leerConfig, type ConfigConstructor, type Copiado } from './config.ts';
import { esIdPieza } from './pieza.ts';

export interface PiezaGuardada {
  id: string;
  config: ConfigConstructor;
  /** Lo que se manda como `esperado` al aplicar otra vez. */
  actualizadoEn: string;
}

/** Una pieza (fila o respuesta de la API), o `null` si no tiene la forma esperada. */
export function leerPiezaGuardada(raw: unknown): PiezaGuardada | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const actualizadoEn = typeof o.actualizadoEn === 'string' ? o.actualizadoEn : o.actualizado_en;
  if (!esIdPieza(o.id) || typeof actualizadoEn !== 'string' || Number.isNaN(Date.parse(actualizadoEn))) return null;
  if (!o.config || typeof o.config !== 'object' || Array.isArray(o.config)) return null;
  return { id: o.id, config: leerConfig(o.config), actualizadoEn };
}

/** Las filas de `widget_piezas` → la pieza de cada widget. Lo que no se lee se descarta. */
export function leerPiezasGuardadas(filas: readonly unknown[]): Record<string, PiezaGuardada> {
  const out: Record<string, PiezaGuardada> = {};
  for (const f of filas) {
    const widget = f && typeof f === 'object' ? (f as { widget?: unknown }).widget : null;
    const p = leerPiezaGuardada(f);
    if (typeof widget === 'string' && p) out[widget] = p;
  }
  return out;
}

/**
 * La copia de un código por id después de aplicar: lo que su web enseñará es
 * lo recién publicado (`contenido`), y la versión de antes pasa a «anterior».
 * Así, si su web aún la enseña unos minutos, «Visto en» dice que se pondrá al
 * día sola, y no que es una versión distinta.
 */
export function copiaTrasAplicar(copia: Copiado, contenidoNuevo: string | null): Copiado {
  if (!contenidoNuevo || copia.contenido === contenidoNuevo) return copia;
  const antes = claveDeCopia(copia);
  const siguiente: Copiado = { ...copia, contenido: contenidoNuevo };
  const nueva = claveDeCopia(siguiente);
  const anteriores = [...new Set([antes, ...(copia.anteriores ?? [])].filter((k): k is string => !!k && k !== nueva))].slice(0, MAX_ANTERIORES);
  if (anteriores.length) siguiente.anteriores = anteriores;
  else delete siguiente.anteriores;
  return siguiente;
}
