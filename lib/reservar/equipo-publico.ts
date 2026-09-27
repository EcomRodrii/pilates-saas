// «Nuestro equipo» en /reservar y en el widget «Instructoras»: lo que dice cada
// tarjeta y cómo avanza el carrusel. Puro, sin React, para poder probarlo.
//
// Qué imparte cada una NO es un campo que rellene nadie: sale de las clases que
// tiene en el horario (mismo criterio que usaba la página). Así nunca se
// anuncia una disciplina que no da.

export interface TipoQueImparte {
  id: string;
  nombre: string;
  /** Color del tipo de clase (paleta categórica), o null si no es un hex válido. */
  color: string | null;
}

interface SesionMinima {
  instructorId?: string | null;
  tipoClaseId: string;
}

interface TipoMinimo {
  id: string;
  nombre: string;
  color?: string | null;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * El color viaja a un `style` en línea: solo un hex pasa. Cualquier otra cosa
 * (vacío, un nombre, algo mal guardado) cae al color de marca en quien pinta.
 */
export function colorSeguro(color: string | null | undefined): string | null {
  const c = color?.trim();
  return c && HEX.test(c) ? c : null;
}

/**
 * Tipos de clase de cada instructora, del que más da al que menos (empate:
 * alfabético). El primero es su disciplina principal, y va primero en la
 * tarjeta.
 */
export function tiposQueImparte(
  sesiones: readonly SesionMinima[],
  tipos: readonly TipoMinimo[],
): Map<string, TipoQueImparte[]> {
  const tipoPorId = new Map(tipos.map(t => [t.id, t]));
  const cuenta = new Map<string, Map<string, number>>();
  for (const s of sesiones) {
    if (!s.instructorId || !tipoPorId.has(s.tipoClaseId)) continue;
    const suyas = cuenta.get(s.instructorId) ?? new Map<string, number>();
    suyas.set(s.tipoClaseId, (suyas.get(s.tipoClaseId) ?? 0) + 1);
    cuenta.set(s.instructorId, suyas);
  }
  const resultado = new Map<string, TipoQueImparte[]>();
  for (const [instructorId, suyas] of cuenta) {
    const lista = [...suyas]
      .map(([id, n]) => ({ t: tipoPorId.get(id)!, n }))
      .sort((a, b) => b.n - a.n || a.t.nombre.localeCompare(b.t.nombre, 'es'))
      .map(({ t }) => ({ id: t.id, nombre: t.nombre, color: colorSeguro(t.color) }));
    resultado.set(instructorId, lista);
  }
  return resultado;
}

/** Dónde empieza y acaba una tarjeta, en coordenadas del contenido desplazable. */
export interface Tramo {
  inicio: number;
  fin: number;
}

// Un píxel de holgura: los anchos salen de `calc()` y llegan con decimales.
const HOLGURA = 1;

/**
 * A qué `scrollLeft` ir al pulsar «siguiente» (1) o «anterior» (-1).
 *
 * - Siguiente: la primera tarjeta que no se veía entera pasa a ser la primera.
 * - Anterior: la última que quedaba cortada por la izquierda pasa a verse
 *   entera, y se alinea al inicio de una tarjeta para que el snap no la mueva.
 *
 * Ninguna tarjeta se salta: lo que estaba a medias se ve entero al pulsar.
 */
export function destinoCarrusel(tarjetas: readonly Tramo[], scroll: number, visible: number, dir: 1 | -1): number {
  if (dir === 1) {
    const cortada = tarjetas.find(t => t.inicio > scroll + HOLGURA && t.fin > scroll + visible + HOLGURA);
    // Sin ninguna cortada ya se está al final; el navegador acota el exceso.
    return cortada ? cortada.inicio : scroll + visible;
  }
  const cortadas = tarjetas.filter(t => t.inicio < scroll - HOLGURA);
  const ultima = cortadas[cortadas.length - 1];
  if (!ultima) return 0;
  const destino = tarjetas.find(t => t.inicio >= ultima.fin - visible - HOLGURA);
  return Math.max(0, Math.min(destino?.inicio ?? 0, ultima.inicio));
}
