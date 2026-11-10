// Lo que decide QUÉ enseña el panel de ayuda del panel (el botón de la esquina),
// separado de cómo se pinta. Pura y sin React, para probarla con `node --test`.
//
// No hay contenido nuevo: las guías salen del centro de ayuda (`registro.ts`), las
// novedades del registro de actualizaciones (`changelog_versiones`, que se
// publica desde /interno) y los mensajes de `soporte_solicitudes`.

import { articulosPublicadosDe, type ArticuloAyuda } from './registro.ts';
import { ayudaDePantalla } from './pantallas.ts';
import { compararVersiones } from '../utils.ts';

export type PestanaAyuda = 'inicio' | 'novedades' | 'mensajes' | 'ayuda';

export const PESTANAS_AYUDA: readonly PestanaAyuda[] = ['inicio', 'novedades', 'mensajes', 'ayuda'];

export function esPestanaAyuda(v: unknown): v is PestanaAyuda {
  return typeof v === 'string' && (PESTANAS_AYUDA as readonly string[]).includes(v);
}

/** El evento con el que cualquier botón del panel abre el panel de ayuda. */
export const EVENTO_ABRIR_AYUDA = 'tentare:abrir-ayuda';

/** Cuántas guías enseña la pestaña Inicio. */
export const GUIAS_EN_INICIO = 3;

/**
 * Las guías de la pantalla en la que estás: primero la de su ficha y luego el
 * resto de su categoría. Una pantalla sin ficha no inventa nada y devuelve las de
 * «Empezar con Tentare»: un panel de ayuda vacío es peor que uno general.
 */
export function guiasParaInicio(ruta: string | null | undefined, max = GUIAS_EN_INICIO): { titulo: string; guias: ArticuloAyuda[] } {
  const ayuda = ayudaDePantalla(ruta);
  if (ayuda) {
    const guias = articulosPublicadosDe(ayuda.destino.categoria)
      .sort((a, b) => Number(b.slug === ayuda.destino.slug) - Number(a.slug === ayuda.destino.slug))
      .slice(0, max);
    if (guias.length > 0) return { titulo: 'Para esta pantalla', guias };
  }
  return { titulo: 'Para empezar', guias: articulosPublicadosDe('empezar').slice(0, max) };
}

// ─── Novedades ───────────────────────────────────────────────────────────────

export interface VersionResumen {
  id: string;
  version: string;
  titulo: string;
  fecha_publicacion: string;
}

/**
 * Más reciente primero. `version` es texto en la tabla, así que 0.10 iría antes
 * que 0.9 por orden alfabético: el empate de fecha se desempata con el
 * comparador del repo (como hace la pantalla de Actualizaciones).
 */
export function ordenarVersiones<T extends VersionResumen>(versiones: readonly T[]): T[] {
  return [...versiones].sort((a, b) =>
    a.fecha_publicacion === b.fecha_publicacion
      ? compararVersiones(b.version, a.version)
      : b.fecha_publicacion.localeCompare(a.fecha_publicacion));
}

/**
 * ¿Hay una versión que esta persona no ha abierto? `vista` es la última versión
 * que vio en ESTE navegador. Sin versiones publicadas no hay nada que avisar; sin
 * haber visto ninguna, sí. Es un aviso de comodidad, no un contador fiable:
 * vive en el navegador y no sigue a la persona de un dispositivo a otro.
 */
export function hayNovedadSinVer(ultima: string | null | undefined, vista: string | null | undefined): boolean {
  if (!ultima) return false;
  return ultima !== vista;
}

export const CLAVE_NOVEDAD_VISTA = 'tentare:ayuda:novedad-vista';

// ─── Mensajes ────────────────────────────────────────────────────────────────

export const ETIQUETA_TIPO_SOPORTE: Readonly<Record<'DUDA' | 'MEJORA' | 'BUG', string>> = {
  DUDA: 'Duda',
  MEJORA: 'Mejora',
  BUG: 'Problema',
};

export function etiquetaTipoSoporte(tipo: string): string {
  return Object.hasOwn(ETIQUETA_TIPO_SOPORTE, tipo) ? ETIQUETA_TIPO_SOPORTE[tipo as keyof typeof ETIQUETA_TIPO_SOPORTE] : 'Mensaje';
}

/**
 * Lo escrito se recorta para la lista, sin cortar una palabra a medias.
 * La lista enseña lo que ESCRIBIÓ la persona, nunca un texto nuestro.
 */
export function extractoMensaje(texto: string, max = 70): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}
