// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — carriles para sesiones que se solapan.
//
// La vista de Día por salas (punto 2) necesita partir en carriles las clases
// que chocan dentro de la MISMA columna (misma sala): dos reformer a las 09:00
// en Sala Norte se pintan lado a lado, no una encima de otra. La vista de
// Semana reutiliza lo mismo dentro de cada columna de día.
//
// Puro: solo necesita inicio/fin en minutos y un id. Nada de fechas, salas ni
// estado — eso lo decide quien llama, agrupando antes por columna.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlotCarril {
  id: string;
  inicioMin: number;
  finMin: number;
}

export interface Carriles {
  /** Índice de carril (0-based) de cada sesión dentro de su grupo de solape. */
  puesto: Map<string, number>;
  /** Nº de carriles del grupo al que pertenece cada sesión — todas las de un
   *  mismo grupo comparten el mismo total, para que el ancho no baile. */
  total: Map<string, number>;
}

export function asignarCarriles(slots: SlotCarril[]): Carriles {
  const orden = [...slots].sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);

  // Barrido lineal: cada slot va al primer carril cuyo último "fin" ya pasó.
  const finCarril: number[] = [];
  const puesto = new Map<string, number>();
  for (const s of orden) {
    let i = finCarril.findIndex(fin => fin <= s.inicioMin);
    if (i < 0) { i = finCarril.length; finCarril.push(0); }
    finCarril[i] = s.finMin;
    puesto.set(s.id, i);
  }

  // Grupos que se tocan comparten el nº de carriles — si no, dos clases del
  // mismo grupo podrían quedar con anchos distintos según cuántas otras caben
  // en SU rango exacto en vez del rango del grupo entero.
  const grupos: SlotCarril[][] = [];
  let actual: SlotCarril[] = [];
  let hasta = -1;
  for (const s of orden) {
    if (s.inicioMin >= hasta && actual.length) { grupos.push(actual); actual = []; }
    actual.push(s);
    hasta = Math.max(hasta, s.finMin);
  }
  if (actual.length) grupos.push(actual);

  const total = new Map<string, number>();
  for (const g of grupos) {
    const n = Math.max(...g.map(s => puesto.get(s.id) ?? 0)) + 1;
    for (const s of g) total.set(s.id, n);
  }

  return { puesto, total };
}
