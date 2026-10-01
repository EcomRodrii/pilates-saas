// ─────────────────────────────────────────────────────────────────────────────
// La vista de Día con las horas muertas plegadas.
//
// El Día sigue siendo una rejilla de tiempo de verdad (una clase de 50 min mide
// 50 min, y arrastrándola se cambia la hora), pero de 12:00 a 18:00 un estudio
// típico no tiene nada: seis horas de rejilla en blanco entre las clases de la
// mañana y las de la tarde, que obligaban a desplazarse para ver el día entero.
// Aquí cada tramo de dos horas o más sin ninguna clase se pliega en una banda
// fina («12:00 – 18:00 · sin clases»), y el resto conserva su escala.
//
// La escala es la ÚNICA conversión entre minutos y píxeles de la vista: pintar,
// arrastrar y tocar un hueco para crear pasan por aquí, así que un tramo
// plegado no puede pintarse en un sitio y recibir el clic en otro.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface TramoEscala {
  desdeMin: number;
  hastaMin: number;
  /** Dónde empieza en la columna, en px. */
  y: number;
  alto: number;
  plegado: boolean;
}

export interface EscalaDia {
  alto: number;
  tramos: TramoEscala[];
  /** La primera y la última hora de la rejilla (minutos). */
  desdeMin: number;
  hastaMin: number;
  /** Las rayas de hora de los tramos visibles, con su etiqueta. `trasPliegue`:
   *  la primera de un tramo (arriba del todo o justo debajo de una banda
   *  plegada), cuya etiqueta no puede subirse a medias sobre lo de arriba. */
  horas: { min: number; y: number; trasPliegue: boolean }[];
}

export interface OpcionesEscala {
  aperturaMin: number;
  cierreMin: number;
  pxPorHora: number;
  /** Alto de la banda de un tramo plegado. */
  altoPlegado?: number;
  /** Desde cuántos minutos sin clases se pliega un tramo. */
  plegarDesdeMin?: number;
}

export const ALTO_PLEGADO_PX = 28;
export const PLEGAR_DESDE_MIN = 120;

export function escalaDia(clases: readonly { inicioMin: number; finMin: number }[], o: OpcionesEscala): EscalaDia {
  const altoPlegado = o.altoPlegado ?? ALTO_PLEGADO_PX;
  const plegarDesde = o.plegarDesdeMin ?? PLEGAR_DESDE_MIN;
  const primera = clases.length ? Math.min(...clases.map(c => c.inicioMin)) : o.aperturaMin;
  const ultima = clases.length ? Math.max(...clases.map(c => c.finMin)) : o.cierreMin;
  const desdeMin = Math.min(o.aperturaMin, Math.floor(primera / 60) * 60);
  const hastaMin = Math.max(o.cierreMin, Math.ceil(ultima / 60) * 60);

  // Horas en las que hay clase (aunque sea un trozo): esas nunca se pliegan.
  const ocupada = new Set<number>();
  for (const c of clases) {
    for (let h = Math.floor(c.inicioMin / 60); h < Math.ceil(c.finMin / 60); h++) ocupada.add(h);
  }

  // Tramos de horas seguidas con la misma suerte (con clase / sin clase).
  const brutos: { desdeMin: number; hastaMin: number; vacio: boolean }[] = [];
  for (let h = desdeMin / 60; h < hastaMin / 60; h++) {
    const vacio = clases.length > 0 && !ocupada.has(h);
    const ultimo = brutos[brutos.length - 1];
    if (ultimo && ultimo.vacio === vacio) ultimo.hastaMin = (h + 1) * 60;
    else brutos.push({ desdeMin: h * 60, hastaMin: (h + 1) * 60, vacio });
  }

  const tramos: TramoEscala[] = [];
  const horas: EscalaDia['horas'] = [];
  let y = 0;
  for (const b of brutos) {
    const plegado = b.vacio && b.hastaMin - b.desdeMin >= plegarDesde;
    const alto = plegado ? altoPlegado : ((b.hastaMin - b.desdeMin) / 60) * o.pxPorHora;
    // Dos tramos visibles seguidos (uno vacío corto y uno con clase) se funden.
    const previo = tramos[tramos.length - 1];
    if (!plegado && previo && !previo.plegado) {
      previo.hastaMin = b.hastaMin;
      previo.alto += alto;
    } else {
      tramos.push({ desdeMin: b.desdeMin, hastaMin: b.hastaMin, y, alto, plegado });
    }
    if (!plegado) {
      const tras = !previo || previo.plegado;
      for (let m = b.desdeMin; m < b.hastaMin; m += 60) {
        horas.push({ min: m, y: y + ((m - b.desdeMin) / 60) * o.pxPorHora, trasPliegue: tras && m === b.desdeMin });
      }
    }
    y += alto;
  }
  // La raya del final del último tramo visible (21:00 tras la clase de 20:30).
  const fin = tramos[tramos.length - 1];
  if (fin && !fin.plegado) horas.push({ min: fin.hastaMin, y: fin.y + fin.alto, trasPliegue: false });

  return { alto: y, tramos, desdeMin, hastaMin, horas };
}

/** Píxeles desde arriba de un minuto del día. En un tramo plegado, el centro de la banda. */
export function yDeMinuto(e: EscalaDia, min: number): number {
  if (e.tramos.length === 0) return 0;
  if (min <= e.desdeMin) return 0;
  if (min >= e.hastaMin) return e.alto;
  const t = e.tramos.find(x => min >= x.desdeMin && min < x.hastaMin) ?? e.tramos[e.tramos.length - 1];
  if (t.plegado) return t.y + t.alto / 2;
  return t.y + ((min - t.desdeMin) / (t.hastaMin - t.desdeMin)) * t.alto;
}

/** El minuto del día en esa altura; null si cae en una banda plegada o fuera de la rejilla. */
export function minutoDeY(e: EscalaDia, y: number): number | null {
  const t = e.tramos.find(x => y >= x.y && y < x.y + x.alto);
  if (!t || t.plegado) return null;
  return t.desdeMin + ((y - t.y) / t.alto) * (t.hastaMin - t.desdeMin);
}

export function textoTramoPlegado(t: Pick<TramoEscala, 'desdeMin' | 'hastaMin'>): string {
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${hh(t.desdeMin)} – ${hh(t.hastaMin)} · sin clases`;
}
