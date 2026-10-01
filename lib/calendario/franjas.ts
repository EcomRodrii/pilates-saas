// ─────────────────────────────────────────────────────────────────────────────
// La semana por franjas: una fila por hora en la que empieza alguna clase.
//
// La semana de antes era una rejilla de tiempo (84 px por hora, de la apertura
// al cierre): en un monitor normal no cabía y había que desplazarse, y las
// horas muertas del mediodía se comían media pantalla. Aquí las clases se
// colocan por la hora en la que EMPIEZAN (09:15 va en la fila de las 09:00), las
// horas en las que ningún día empieza nada se pliegan en una sola línea, y los
// días sin clases se quedan estrechos. Cabe la semana entera.
//
// La hora exacta no se pierde: la lleva cada tarjeta, y la vista de Día sigue
// siendo una rejilla de tiempo de verdad (allí se cambia la hora arrastrando).
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaseEnFranja {
  id: string;
  /** Columna (0 = primer día de la ventana visible). */
  dia: number;
  /** Minutos desde medianoche en hora del estudio. */
  inicioMin: number;
  /** Desempate entre dos clases a la misma hora (el orden de las salas). */
  orden?: number;
}

export type FilaFranja =
  | { tipo: 'hora'; hora: number }
  /** Horas [desde, hasta) en las que ningún día empieza ninguna clase. */
  | { tipo: 'hueco'; desde: number; hasta: number };

export function horaDeFranja(inicioMin: number): number {
  return Math.floor(inicioMin / 60);
}

/** Las filas de la semana: las horas con clase, y lo de en medio plegado. */
export function filasDeFranjas(clases: readonly Pick<ClaseEnFranja, 'inicioMin'>[]): FilaFranja[] {
  if (clases.length === 0) return [];
  const horas = [...new Set(clases.map(c => horaDeFranja(c.inicioMin)))].sort((a, b) => a - b);
  const filas: FilaFranja[] = [];
  horas.forEach((hora, i) => {
    const anterior = horas[i - 1];
    if (anterior != null && hora - anterior > 1) filas.push({ tipo: 'hueco', desde: anterior + 1, hasta: hora });
    filas.push({ tipo: 'hora', hora });
  });
  return filas;
}

export function claveCelda(dia: number, hora: number): string {
  return `${dia}:${hora}`;
}

/** Qué clases van en cada casilla (día × hora), por hora de inicio y sala. */
export function clasesPorCelda(clases: readonly ClaseEnFranja[]): Map<string, string[]> {
  const ordenadas = [...clases].sort((a, b) => a.inicioMin - b.inicioMin || (a.orden ?? 0) - (b.orden ?? 0) || a.id.localeCompare(b.id));
  const m = new Map<string, string[]>();
  for (const c of ordenadas) {
    const k = claveCelda(c.dia, horaDeFranja(c.inicioMin));
    const arr = m.get(k);
    if (arr) arr.push(c.id); else m.set(k, [c.id]);
  }
  return m;
}

/** Los días (columnas) que tienen alguna clase: el resto se dibuja estrecho. */
export function diasConClases(clases: readonly Pick<ClaseEnFranja, 'dia'>[], nDias = 7): boolean[] {
  const con = new Set(clases.map(c => c.dia));
  return Array.from({ length: nDias }, (_, i) => con.has(i));
}

export function textoHueco(f: { desde: number; hasta: number }): string {
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${hh(f.desde)} – ${hh(f.hasta)} · ningún día hay clases a estas horas`;
}
