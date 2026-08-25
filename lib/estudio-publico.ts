// Lo que la página pública de reservas cuenta del estudio y NO está guardado en
// ningún sitio: se deduce de lo que el estudio hace de verdad.
//
// El diseño pedía un horario («Lunes a viernes 07:00 – 21:00») y un bono
// destacado («EL MÁS ELEGIDO»). Los dos podrían haber sido columnas que
// rellenara la dueña, y los dos habrían empezado a mentir el día que moviera
// una clase o cambiara de tarifa — en la página por la que entra una clienta
// nueva, que es el peor sitio para tener un dato viejo.

import type { PlanTarifa, Sesion, Suscripcion } from './types';

// ── Horario ──────────────────────────────────────────────────────────────────

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TramoDia {
  /** 1 = lunes … 0 = domingo, como getDay() de JavaScript. */
  dia: DiaSemana;
  /** 'HH:MM' de la primera clase y del final de la última. null = cerrado. */
  abre: string | null;
  cierra: string | null;
}

export interface FranjaHorario {
  /** 'Lunes a viernes', 'Sábado', 'Lunes, miércoles y viernes'… */
  dias: string;
  /** '07:00 – 21:00' o 'Cerrado'. */
  horas: string;
}

export interface HorarioPublico {
  franjas: FranjaHorario[];
  /**
   * false cuando hay muy pocos días distintos con clase programada para
   * afirmar que el resto de la semana está cerrado — un estudio nuevo con
   * el calendario a medio cargar (una sola clase recurrente) no "abre 50
   * minutos a la semana", solo le falta cargar el resto.
   */
  confiable: boolean;
}

/** Por debajo de esto, no se declara ningún día "Cerrado": faltan datos. */
const MIN_DIAS_CON_CLASE_PARA_CERRADO = 3;

const NOMBRE_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// El orden en que se lee un horario: la semana empieza en lunes, no en domingo.
const ORDEN: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Primera y última hora de clase de cada día de la semana.
 *
 * Se mira una ventana de sesiones ya filtrada por quien llama (lo razonable son
 * las próximas semanas): con el histórico entero, una clase suelta de hace un
 * año a las 6:30 ensancharía el horario para siempre.
 */
export function tramosPorDia(sesiones: Sesion[]): TramoDia[] {
  const porDia = new Map<DiaSemana, { abre: Date; cierra: Date }>();
  for (const s of sesiones) {
    if (s.cancelada) continue;
    const ini = new Date(s.inicio);
    const fin = new Date(s.fin);
    if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime())) continue;
    const dia = ini.getDay() as DiaSemana;
    const actual = porDia.get(dia);
    if (!actual) { porDia.set(dia, { abre: ini, cierra: fin }); continue; }
    if (hhmm(ini) < hhmm(actual.abre)) actual.abre = ini;
    if (hhmm(fin) > hhmm(actual.cierra)) actual.cierra = fin;
  }
  return ORDEN.map(dia => {
    const t = porDia.get(dia);
    return { dia, abre: t ? hhmm(t.abre) : null, cierra: t ? hhmm(t.cierra) : null };
  });
}

/** Une los días seguidos que comparten horario: «Lunes a viernes 07:00 – 21:00». */
export function horarioPublico(sesiones: Sesion[]): HorarioPublico {
  const tramos = tramosPorDia(sesiones);
  const diasConClase = tramos.filter(t => t.abre).length;
  if (diasConClase === 0) return { franjas: [], confiable: true };

  const confiable = diasConClase >= MIN_DIAS_CON_CLASE_PARA_CERRADO;

  const franjas: FranjaHorario[] = [];
  let bloque: TramoDia[] = [];

  const clave = (t: TramoDia) => (t.abre ? `${t.abre}-${t.cierra}` : 'cerrado');
  const cerrar = () => {
    if (!bloque.length) return;
    const primero = bloque[0], ultimo = bloque[bloque.length - 1];
    // Dos días seguidos se escriben con "y"; tres o más, con "a". "Lunes a
    // martes" suena a error; "Lunes y martes", no.
    const dias = bloque.length === 1
      ? NOMBRE_DIA[primero.dia]
      : bloque.length === 2
        ? `${NOMBRE_DIA[primero.dia]} y ${NOMBRE_DIA[ultimo.dia].toLowerCase()}`
        : `${NOMBRE_DIA[primero.dia]} a ${NOMBRE_DIA[ultimo.dia].toLowerCase()}`;
    franjas.push({ dias, horas: primero.abre ? `${primero.abre} – ${primero.cierra}` : 'Cerrado' });
    bloque = [];
  };

  for (const t of tramos) {
    if (bloque.length && clave(bloque[bloque.length - 1]) !== clave(t)) cerrar();
    bloque.push(t);
  }
  cerrar();

  // Sin confianza suficiente, se calla en vez de afirmar: se enseñan los días
  // que sí tienen clase real y se omiten los bloques "Cerrado" en lugar de
  // dar por hecho que el resto de la semana no abre.
  return { franjas: confiable ? franjas : franjas.filter(f => f.horas !== 'Cerrado'), confiable };
}

// ── El bono más elegido ──────────────────────────────────────────────────────

/**
 * El plan que más se ha contratado de verdad, para la etiqueta «EL MÁS ELEGIDO».
 *
 * Devuelve null si no hay con qué decidirlo: sin ventas, o con un empate en lo
 * más alto. Un empate resuelto a dedo pondría la etiqueta en un plan que no la
 * ha ganado, y la etiqueta solo vale si es cierta.
 *
 * Solo cuenta planes visibles y con más de una venta: destacar el único bono
 * que alguien compró una vez no es información, es ruido.
 */
export function planMasElegido(planes: PlanTarifa[], suscripciones: Suscripcion[]): string | null {
  const visibles = new Set(planes.map(p => p.id));
  const cuenta = new Map<string, number>();
  for (const s of suscripciones) {
    if (!visibles.has(s.planId)) continue;
    cuenta.set(s.planId, (cuenta.get(s.planId) ?? 0) + 1);
  }
  if (cuenta.size < 2) return null;

  const ordenado = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const [ganadorId, votos] = ordenado[0];
  if (votos < 2) return null;
  if (ordenado[1] && ordenado[1][1] === votos) return null; // empate: nadie destaca
  return ganadorId;
}

/** «17,50 € por clase» — solo tiene sentido en bonos con número de sesiones. */
export function precioPorClase(plan: Pick<PlanTarifa, 'precio' | 'sesiones'>): string | null {
  if (!plan.sesiones || plan.sesiones <= 0 || plan.precio <= 0) return null;
  const porClase = plan.precio / plan.sesiones;
  return `${porClase.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € por clase`;
}
