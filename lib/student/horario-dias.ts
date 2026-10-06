// El horario de la alumna (P13 y filtros): qué día abre, qué días tienen clases o una reserva suya, y los filtros de
// franja y sala. Puro, imports relativos con `.ts` (horario-dias.test.ts).

import { addDias } from './formato.ts';
import { estaEnCurso } from './estado-clase.ts';
import type { Clase, Reserva } from './tipos.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partes(iso: string): { dia: number; mes: number; semana: number } | null {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : { dia: d.getUTCDate(), mes: d.getUTCMonth(), semana: d.getUTCDay() };
}

/**
 * El día con el que abre el horario. Hoy, si queda alguna clase por EMPEZAR o ella tiene una suya en curso; si no, el
 * primero de los próximos días con alguna por empezar (y se dice: `saltado`). Sin nada en esos días, hoy y sin salto.
 *
 * Mira el horario SIN filtrar: un filtro no decide qué día es. Sin reloj (`ahoraMs` null, el servidor) no salta.
 */
export function primerDiaConClases(
  clases: Pick<Clase, 'id' | 'fecha' | 'inicio' | 'fin'>[],
  { hoy, ahoraMs, dias = 14, reservas = [] }: { hoy: string; ahoraMs: number | null; dias?: number; reservas?: Pick<Reserva, 'claseId' | 'estado'>[] },
): { dia: string; saltado: boolean } {
  if (ahoraMs === null) return { dia: hoy, saltado: false };
  const porEmpezar = (c: Pick<Clase, 'inicio'>) => Date.parse(c.inicio) > ahoraMs;
  const suyas = new Set(reservas.filter((r) => r.estado === 'confirmada').map((r) => r.claseId));
  const deHoy = clases.filter((c) => c.fecha === hoy);
  if (deHoy.some(porEmpezar) || deHoy.some((c) => suyas.has(c.id) && estaEnCurso(c, ahoraMs))) return { dia: hoy, saltado: false };
  for (let i = 1; i < dias; i += 1) {
    const d = addDias(hoy, i);
    if (clases.some((c) => c.fecha === d && porEmpezar(c))) return { dia: d, saltado: true };
  }
  return { dia: hoy, saltado: false };
}

/** «Hoy ya no quedan clases por empezar. Te enseñamos las de mañana.» (o «… el martes 7.»). */
export function avisoDeSalto(hoy: string, dia: string): string {
  const p = partes(dia);
  const cuando = dia === addDias(hoy, 1) ? 'las de mañana' : p ? `el ${DIAS[p.semana]} ${p.dia}` : 'el siguiente día con clases';
  return `Hoy ya no quedan clases por empezar. Te enseñamos ${cuando}.`;
}

/** Los días con alguna clase. */
export function diasConClases(clases: Pick<Clase, 'fecha'>[]): Set<string> {
  return new Set(clases.map((c) => c.fecha));
}

/** Los días con una reserva CONFIRMADA suya (lista de espera y pendiente no: aún no tiene plaza), el criterio del calendario. */
export function diasConReserva(reservas: Pick<Reserva, 'claseId' | 'estado'>[], clases: Pick<Clase, 'id' | 'fecha'>[]): Set<string> {
  const fecha = new Map(clases.map((c) => [c.id, c.fecha]));
  const dias = new Set<string>();
  for (const r of reservas) {
    if (r.estado !== 'confirmada') continue;
    const f = fecha.get(r.claseId);
    if (f) dias.add(f);
  }
  return dias;
}

/** «1 nov»: el mes, en el primer día de la tira y en cada día 1, para que una tira que cruza de mes no engañe. */
export function marcaDeMes(iso: string): string {
  const p = partes(iso);
  return p ? `${p.dia} ${MESES[p.mes]}` : '';
}

export type Franja = 'todo' | 'manana' | 'tarde';

/** Mañanas hasta las 14:00 (exclusive), en la hora del estudio (`Clase.hora`). */
export function franjaDe(hora: string): Exclude<Franja, 'todo'> {
  return hora < '14:00' ? 'manana' : 'tarde';
}

export interface SalaHorario { id: string; nombre: string }

/** Las salas con clases en esos días, una vez cada una y en orden alfabético (castellano). */
export function salasDelHorario(clases: Pick<Clase, 'salaId' | 'sala' | 'fecha'>[], desde: string, hasta: string): SalaHorario[] {
  const porId = new Map<string, string>();
  for (const c of clases) {
    if (c.fecha < desde || c.fecha > hasta) continue;
    if (!c.salaId || !c.sala.trim()) continue;
    if (!porId.has(c.salaId)) porId.set(c.salaId, c.sala.trim());
  }
  return [...porId].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * La lista del horario: el día (salvo buscando, que mira TODO el horario), el tipo/«Favoritas»/«Con hueco» de siempre,
 * la búsqueda sin tildes ni mayúsculas, y además la franja y la sala. La sala solo cuenta con 2 o más salas: una sala
 * recordada que no se ve no filtra.
 */
export function filtrarHorario<C extends Pick<Clase, 'fecha' | 'hora' | 'tipo' | 'nombre' | 'tipoClaseId' | 'plazasLibres' | 'instructoraId' | 'salaId'>>(
  clases: C[],
  f: {
    dia: string; consulta: string; tipo: string; favoritos: Set<string>; franja: Franja; sala: string | null;
    salasVisibles: number; nombreInstructora: (id: string) => string;
  },
): C[] {
  const consulta = normalizar(f.consulta.trim());
  const sala = f.salasVisibles >= 2 ? f.sala : null;
  return clases
    .filter((c) => (consulta ? true : c.fecha === f.dia))
    .filter((c) => f.tipo === 'Todo'
      || (f.tipo === 'Con hueco' ? c.plazasLibres > 0
        : f.tipo === 'Favoritas' ? f.favoritos.has(c.tipoClaseId)
          : c.tipo === f.tipo))
    .filter((c) => !consulta
      || normalizar(c.nombre).includes(consulta)
      || normalizar(c.tipo).includes(consulta)
      || normalizar(f.nombreInstructora(c.instructoraId)).includes(consulta))
    .filter((c) => f.franja === 'todo' || franjaDe(c.hora) === f.franja)
    .filter((c) => !sala || c.salaId === sala)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

/**
 * Los filtros que ella dejó puestos en este móvil (franja y sala). Con algo roto —JSON inválido, una franja inventada,
 * una sala que ya no está— se vuelve a «sin filtro»: un filtro recordado nunca puede vaciar el horario sin que se vea.
 */
export function leerFiltrosGuardados(cadena: string | null, salasVigentes: SalaHorario[]): { franja: Franja; sala: string | null } {
  const nada = { franja: 'todo' as Franja, sala: null };
  if (!cadena) return nada;
  try {
    const v = JSON.parse(cadena) as { franja?: unknown; sala?: unknown };
    const franja: Franja = v.franja === 'manana' || v.franja === 'tarde' ? v.franja : 'todo';
    const sala = typeof v.sala === 'string' && salasVigentes.some((s) => s.id === v.sala) ? v.sala : null;
    return { franja, sala };
  } catch {
    return nada;
  }
}
