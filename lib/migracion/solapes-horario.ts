// Solapes de horario al importar clases.
//
// La base de datos NO deja que una sala (`sesiones_sala_sin_solape`) ni una
// instructora (`sesiones_instructor_sin_solape`) tengan dos clases a la vez, y
// con razón. Pero un `INSERT` por lotes de 500 es atómico: una sola fila que se
// pisa tumbaba las 500 y la pantalla decía «revisa que todas las filas tengan
// sala y hora», que no es lo que pasa. Aquí se detecta ANTES de escribir, por
// fila, para decir cuál se pisa con qué y dejar pasar el resto.
//
// Puro: sin base de datos ni fechas del sistema, para poder probarlo a fondo.

export interface ClasePendiente {
  /** Fila del archivo de origen (1 = primera fila de datos). */
  fila: number;
  clase: string;
  salaId: string | null;
  instructorId: string | null;
  /** ISO. El rango es semiabierto [inicio, fin): dos clases seguidas no chocan. */
  inicio: string;
  fin: string;
}

export interface ClaseExistente {
  salaId: string | null;
  instructorId: string | null;
  inicio: string;
  fin: string;
  cancelada: boolean;
}

export interface ConflictoHorario {
  fila: number;
  clase: string;
  inicio: string;
  recurso: 'sala' | 'instructora';
  recursoId: string;
  /** Con qué choca: «una clase que ya tienes» o «la fila N del archivo». */
  contra: { tipo: 'existente' } | { tipo: 'fila'; fila: number };
}

interface Tramo { ini: number; fin: number; fila: number | null }

const choca = (a: Tramo, ini: number, fin: number) => ini < a.fin && a.ini < fin;

/**
 * Reparte las clases pendientes en las que se pueden crear y las que se pisan.
 * Las existentes mandan (ya están en el calendario) y, entre las del archivo,
 * gana la primera en orden de fila: la segunda es la que se avisa.
 */
export function detectarSolapes<T extends ClasePendiente>(
  pendientes: T[],
  existentes: ClaseExistente[],
): { validas: T[]; conflictos: ConflictoHorario[] } {
  const porRecurso = new Map<string, Tramo[]>();
  const tramos = (clave: string) => {
    let t = porRecurso.get(clave);
    if (!t) { t = []; porRecurso.set(clave, t); }
    return t;
  };

  for (const e of existentes) {
    if (e.cancelada) continue;
    const ini = Date.parse(e.inicio);
    const fin = Date.parse(e.fin);
    if (!(fin > ini)) continue;
    if (e.salaId) tramos(`sala:${e.salaId}`).push({ ini, fin, fila: null });
    if (e.instructorId) tramos(`ins:${e.instructorId}`).push({ ini, fin, fila: null });
  }

  const validas: T[] = [];
  const conflictos: ConflictoHorario[] = [];

  for (const p of pendientes) {
    const ini = Date.parse(p.inicio);
    const fin = Date.parse(p.fin);
    // Una clase sin duración (o que acaba antes de empezar) no se puede juzgar
    // aquí: la rechazaría la base de datos igualmente, y mejor decirlo ahora.
    const pisaA: { recurso: 'sala' | 'instructora'; recursoId: string; contra: ConflictoHorario['contra'] }[] = [];
    if (p.salaId) {
      const t = tramos(`sala:${p.salaId}`).find(x => choca(x, ini, fin));
      if (t) pisaA.push({ recurso: 'sala', recursoId: p.salaId, contra: t.fila === null ? { tipo: 'existente' } : { tipo: 'fila', fila: t.fila } });
    }
    if (p.instructorId) {
      const t = tramos(`ins:${p.instructorId}`).find(x => choca(x, ini, fin));
      if (t) pisaA.push({ recurso: 'instructora', recursoId: p.instructorId, contra: t.fila === null ? { tipo: 'existente' } : { tipo: 'fila', fila: t.fila } });
    }
    if (pisaA.length > 0) {
      for (const c of pisaA) conflictos.push({ fila: p.fila, clase: p.clase, inicio: p.inicio, ...c });
      continue;
    }
    if (p.salaId) tramos(`sala:${p.salaId}`).push({ ini, fin, fila: p.fila });
    if (p.instructorId) tramos(`ins:${p.instructorId}`).push({ ini, fin, fila: p.fila });
    validas.push(p);
  }

  return { validas, conflictos };
}

/** Frase para una persona: «Fila 12 · Reformer · lun 12 oct 08:00: la sala ya tiene otra clase a esa hora». */
export function textoConflicto(
  c: ConflictoHorario,
  nombres: { sala?: (id: string) => string | undefined; instructora?: (id: string) => string | undefined },
  formatoFecha: (iso: string) => string,
): string {
  const quien = c.recurso === 'sala'
    ? `la sala ${nombres.sala?.(c.recursoId) ?? ''}`.trim()
    : `${nombres.instructora?.(c.recursoId) ?? 'la instructora'}`;
  const con = c.contra.tipo === 'existente' ? 'otra clase que ya tienes' : `la fila ${c.contra.fila} del archivo`;
  const verbo = c.recurso === 'sala' ? 'ya está ocupada' : 'ya da otra clase';
  return `Fila ${c.fila} · ${c.clase} · ${formatoFecha(c.inicio)}: ${quien} ${verbo} a esa hora (${con}).`;
}
