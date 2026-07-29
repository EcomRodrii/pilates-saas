// Lo que la clienta ve de su propia constancia, calculado de sus reservas.
//
// Nada de esto se guarda: todo sale de las clases a las que de verdad ha ido
// (reservas ASISTIDA) cruzadas con sus sesiones. Guardar un contador sería
// crear una segunda verdad que se desincroniza en cuanto alguien corrige una
// asistencia a mano en el panel — y lo corrigen.

import type { Reserva, Sesion, TipoClase, Instructor } from './types';

export interface ResumenProgreso {
  clases: number;
  /** Horas dentro de la sala, redondeadas. Suma de la duración de cada clase. */
  horas: number;
}

const ASISTIDA = (r: Reserva) => r.estado === 'ASISTIDA';

export function resumenProgreso(reservas: Reserva[], sesiones: Sesion[]): ResumenProgreso {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  let minutos = 0;
  let clases = 0;
  for (const r of reservas) {
    if (!ASISTIDA(r)) continue;
    const s = porId.get(r.sesionId);
    if (!s) continue;
    clases += 1;
    const d = (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 60000;
    if (Number.isFinite(d) && d > 0) minutos += d;
  }
  return { clases, horas: Math.round(minutos / 60) };
}

export interface BarraSemana {
  /** Lunes de esa semana, en ISO corto. Sirve de clave estable. */
  semana: string;
  clases: number;
  /** Altura relativa 0-1 sobre la semana más alta. 0 si no fue ninguna. */
  altura: number;
  /** Las semanas del mes en curso se pintan sólidas; las demás, apagadas. */
  esteMes: boolean;
  /** Etiqueta de mes, solo en la primera semana de cada mes. */
  mes: string | null;
}

function lunesDe(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// La clave de semana se compone de las partes LOCALES de la fecha, nunca con
// toISOString(): eso pasa a UTC, y en España la medianoche local es las 22:00
// del día anterior en UTC — el lunes se convertía en domingo y todas las
// asistencias caían en la semana equivocada. Lo cazó el test, no la lectura.
function claveLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Asistencias por semana, de la más antigua a la actual.
 *
 * Devuelve SIEMPRE `cuantas` barras aunque no haya ido nunca: un gráfico que
 * cambia de ancho según los datos salta a la vista cada vez que se entra.
 */
export function barrasPorSemana(
  reservas: Reserva[], sesiones: Sesion[], ahora: Date, cuantas = 12,
): BarraSemana[] {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  const cuenta = new Map<string, number>();
  for (const r of reservas) {
    if (!ASISTIDA(r)) continue;
    const s = porId.get(r.sesionId);
    if (!s) continue;
    const clave = claveLocal(lunesDe(new Date(s.inicio)));
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  const lunesActual = lunesDe(ahora);
  const barras: BarraSemana[] = [];
  for (let i = cuantas - 1; i >= 0; i--) {
    const l = new Date(lunesActual);
    l.setDate(l.getDate() - i * 7);
    const clave = claveLocal(l);
    barras.push({
      semana: clave,
      clases: cuenta.get(clave) ?? 0,
      altura: 0,
      esteMes: l.getMonth() === ahora.getMonth() && l.getFullYear() === ahora.getFullYear(),
      mes: null,
    });
  }

  const maximo = Math.max(1, ...barras.map(b => b.clases));
  let mesAnterior = -1;
  for (const b of barras) {
    b.altura = b.clases / maximo;
    // `b.semana` es 'AAAA-MM-DD' local: el mes sale del propio texto, sin
    // volver a pasar por Date y arriesgar otro desfase de zona.
    const m = Number(b.semana.slice(5, 7)) - 1;
    // La etiqueta solo en la primera barra de cada mes: repetirla en las cuatro
    // convierte el pie del gráfico en una fila de ruido.
    if (m !== mesAnterior) { b.mes = MES[m]; mesAnterior = m; }
  }
  return barras;
}

export interface ClaseFavorita {
  nombre: string;
  veces: number;
  total: number;
  /** Solo si SIEMPRE ha sido con la misma; si no, null. */
  instructoraFija: string | null;
}

/**
 * El tipo de clase al que más ha ido.
 *
 * Devuelve null con menos de tres asistencias o si hay empate arriba: «tu clase
 * favorita» con dos clases y un empate no es un dato, es una casualidad.
 */
export function claseFavorita(
  reservas: Reserva[], sesiones: Sesion[], tiposClase: TipoClase[], instructores: Instructor[],
): ClaseFavorita | null {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  const cuenta = new Map<string, number>();
  const instrPorTipo = new Map<string, Set<string>>();
  let total = 0;

  for (const r of reservas) {
    if (!ASISTIDA(r)) continue;
    const s = porId.get(r.sesionId);
    if (!s) continue;
    total += 1;
    cuenta.set(s.tipoClaseId, (cuenta.get(s.tipoClaseId) ?? 0) + 1);
    const set = instrPorTipo.get(s.tipoClaseId) ?? new Set<string>();
    set.add(s.instructorId);
    instrPorTipo.set(s.tipoClaseId, set);
  }

  if (total < 3) return null;
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const [tipoId, veces] = orden[0];
  if (orden[1] && orden[1][1] === veces) return null;

  const tipo = tiposClase.find(tc => tc.id === tipoId);
  if (!tipo) return null;

  const instrs = instrPorTipo.get(tipoId);
  const instructoraFija = instrs && instrs.size === 1
    ? instructores.find(i => i.id === [...instrs][0])?.nombre ?? null
    : null;

  return { nombre: tipo.nombre, veces, total, instructoraFija };
}
