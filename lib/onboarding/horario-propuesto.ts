// ─────────────────────────────────────────────────────────────────────────────
// La semana de clases que Tentare PROPONE al terminar el asistente.
//
// ⚠️ POR QUÉ EXISTE. Medido en producción sobre las 10 altas reales: 10 de 10
// acaban con salas, 9 de 10 con tipos de clase… y solo 4 de 10 llegan a
// programar una sola clase. La caída del 90 % al 40 % cae EXACTAMENTE en la
// frontera de lo que el asistente crea solo. Y sin clases programadas la página
// pública no tiene nada que enseñar, así que la primera reserva —el momento en
// que el producto empieza a valer— es imposible por construcción: solo 2 de 10
// estudios han recibido alguna.
//
// ⚠️ PROPONE, NO IMPONE, y la diferencia es el motivo por el que esto existe.
// La regla de plan-configuracion.ts es «solo se crea lo que la propietaria ha
// dicho», y se respeta: este módulo NO escribe nada. Devuelve una propuesta que
// se le enseña en pantalla, donde puede quitar clases o descartarla entera. Se
// crea solo si le da a confirmar — y entonces sí lo ha dicho.
//
// Puro y sin dependencias: se prueba entero con `node --test`.
//
// La escritura la hace el importador de horario que YA existe
// (`POST /api/clases/import`), que expande filas por día de la semana, crea los
// tipos de clase que falten, empareja sala e instructora por nombre y registra
// el lote en `migracion_batches` para poder DESHACERLO. No se reinventa nada.
// ─────────────────────────────────────────────────────────────────────────────

/** Día de la semana en el formato que espera el importador (DOW de Postgres). */
export const DIAS_SEMANA = [
  { dow: 1, etiqueta: 'Lunes', corto: 'L' },
  { dow: 2, etiqueta: 'Martes', corto: 'M' },
  { dow: 3, etiqueta: 'Miércoles', corto: 'X' },
  { dow: 4, etiqueta: 'Jueves', corto: 'J' },
  { dow: 5, etiqueta: 'Viernes', corto: 'V' },
  { dow: 6, etiqueta: 'Sábado', corto: 'S' },
  { dow: 0, etiqueta: 'Domingo', corto: 'D' },
] as const;

export interface ClasePropuesta {
  /** Nombre del tipo de clase. El importador lo crea si no existe. */
  clase: string;
  diaSemana: number;
  horaInicio: string;   // 'HH:MM'
  horaFin: string;      // 'HH:MM'
  sala: string | null;
  aforo: number | null;
  /** Nombre de la instructora. El importador la empareja por nombre. */
  instructor: string | null;
}

export interface SalaPropuesta {
  nombre: string;
  capacidad?: number | null;
}

export interface EntradaPropuesta {
  /** Días que abre, en DOW. Sin días no hay propuesta. */
  dias: number[];
  /** Franja del estudio, 'HH:MM:SS' o 'HH:MM'. */
  horaApertura?: string;
  horaCierre?: string;
  duracionMinutos?: number;
  tiposClase?: string[];
  /** Salas del estudio con su aforo real, tal y como las dejó el asistente. */
  salas?: SalaPropuesta[];
  /**
   * Quién da las clases, si se sabe sin adivinar: hoy, solo cuando el equipo
   * es UNA persona (la propietaria que dijo «sí, yo doy clases»). Con más
   * gente no se reparte nada — eso es una decisión suya.
   */
  instructora?: string | null;
}

const MIN_POR_HORA = 60;

function aMinutos(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * MIN_POR_HORA + min;
}

function aHHMM(minutos: number): string {
  const h = Math.floor(minutos / MIN_POR_HORA);
  const m = minutos % MIN_POR_HORA;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Las horas a las que se propone clase dentro de la franja.
 *
 * ⚠️ EN LOS PICOS DE UN ESTUDIO, NO EN LOS BORDES DE LA FRANJA. La versión
 * anterior ponía dos clases al abrir y dos al cerrar, así que «Mañana y tarde
 * (7:00 a 22:00)» salía 07:00, 08:00, 20:00 y 21:00: nada entre las 9 y las 20,
 * y una clase de Prenatal a las 21:00. Lo vio una propietaria probando la app
 * (evaluación del 13-sep): «esto no es mi estudio».
 *
 * Un estudio de Pilates llena a media mañana (desde las 9) y a la salida del
 * trabajo (desde las 18). Así que cada bloque arranca en su pico —o en la
 * apertura, si abre más tarde— y propone dos clases seguidas en punto. Una
 * franja que no llega a un pico (solo mañanas) da un solo bloque, que es lo
 * correcto: son menos horas.
 */
const PICO_MANANA = 9 * MIN_POR_HORA;
const FIN_MANANA = 13 * MIN_POR_HORA;
const PICO_TARDE = 18 * MIN_POR_HORA;
/** Desde cuándo una franja «tiene tarde» aunque no llegue al pico de las 18. */
const INICIO_TARDE = 16 * MIN_POR_HORA;

export function horasPropuestas(aperturaMin: number, cierreMin: number, duracion: number): number[] {
  const cabe = (inicio: number) => inicio >= aperturaMin && inicio + duracion <= cierreMin;
  const enPunto = (m: number) => Math.ceil(m / MIN_POR_HORA) * MIN_POR_HORA;
  const horas = new Set<number>();
  const bloque = (inicio: number) => {
    if (!cabe(inicio)) return false;
    horas.add(inicio);
    if (cabe(inicio + MIN_POR_HORA)) horas.add(inicio + MIN_POR_HORA);
    return true;
  };

  const inicioManana = Math.max(enPunto(aperturaMin), PICO_MANANA);
  if (inicioManana < FIN_MANANA) bloque(inicioManana);

  const inicioTarde = Math.max(enPunto(aperturaMin), PICO_TARDE);
  if (!bloque(inicioTarde)) {
    // La franja cierra antes de que quepa una clase a las 18 (p.ej. 13:00–18:30):
    // las dos últimas en punto de la tarde, si las hay. Solo si la franja llega
    // de verdad a la tarde — «Solo mañanas (7:00 a 15:00)» no tiene tarde, y sin
    // este tope salía con clases a las 13:00 y 14:00.
    const ultima = Math.floor((cierreMin - duracion) / MIN_POR_HORA) * MIN_POR_HORA;
    if (ultima >= INICIO_TARDE && !horas.has(ultima)) {
      if (cabe(ultima - MIN_POR_HORA) && ultima - MIN_POR_HORA >= FIN_MANANA) horas.add(ultima - MIN_POR_HORA);
      if (cabe(ultima)) horas.add(ultima);
    }
  }

  // Franjas raras que no tocan ningún pico (p.ej. 7:00–9:00): la primera en punto.
  if (horas.size === 0 && cabe(enPunto(aperturaMin))) horas.add(enPunto(aperturaMin));

  return [...horas].sort((a, b) => a - b);
}

/**
 * Tipos de clase que se dan en MÁQUINA. Van a la sala pequeña: una sala de
 * máquinas cabe lo que caben las máquinas, y el suelo (Mat, Yoga, Prenatal…)
 * es lo que llena la sala grande.
 */
const RE_MAQUINA = /reformer|cadillac|barril|barrel|silla|chair|tower|torre|m[aá]quina|wunda/i;

/**
 * Sala de cada tipo de clase.
 *
 * ⚠️ Antes TODO iba a la primera sala, con su aforo: un estudio con Sala 1
 * (8 plazas, máquinas) y Sala 2 (12 plazas) recibía Mat y Yoga a 8 plazas y la
 * Sala 2 sin una sola clase. Con una sala no hay nada que decidir; con varias,
 * máquinas a la de menos aforo y suelo a la de más. Nunca hay dos clases a la
 * misma hora (una por hueco), así que repartir salas no puede solaparse.
 */
export function salaParaTipo(tipo: string, salas: SalaPropuesta[]): SalaPropuesta | null {
  if (salas.length === 0) return null;
  if (salas.length === 1) return salas[0];
  const conAforo = salas.map((s, i) => ({ s, i, cap: s.capacidad ?? null }));
  const conocidas = conAforo.filter((x) => x.cap != null);
  // Sin aforos no se puede saber cuál es la grande: se queda la primera.
  if (conocidas.length < 2) return salas[0];
  const orden = [...conocidas].sort((a, b) => (a.cap! - b.cap!) || (a.i - b.i));
  return RE_MAQUINA.test(tipo) ? orden[0].s : orden[orden.length - 1].s;
}

/**
 * Respuestas del asistente → semana propuesta.
 *
 * Devuelve `[]` —y no una semana a medias— si falta cualquiera de las piezas
 * imprescindibles: días, franja válida, duración o algún tipo de clase. Mismo
 * criterio que `planificarConfiguracion`: sin respuesta no se inventa nada.
 */
export function proponerHorario(e: EntradaPropuesta): ClasePropuesta[] {
  const dias = [...new Set(e.dias ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const apertura = aMinutos(e.horaApertura);
  const cierre = aMinutos(e.horaCierre);
  const duracion = e.duracionMinutos;
  const tipos = (e.tiposClase ?? []).filter((t) => t.trim() !== '');

  if (dias.length === 0 || apertura == null || cierre == null || cierre <= apertura) return [];
  if (!duracion || duracion <= 0 || duracion > cierre - apertura) return [];
  if (tipos.length === 0) return [];

  const horas = horasPropuestas(apertura, cierre, duracion);
  if (horas.length === 0) return [];

  const salas = (e.salas ?? []).filter((s) => s.nombre.trim() !== '');
  const instructor = e.instructora?.trim() || null;

  // Los tipos de clase ROTAN por el conjunto de huecos de la semana, no por
  // día: si rotaran dentro del día, un estudio con dos tipos tendría lunes
  // «Reformer, Mat» y martes «Reformer, Mat» idénticos. Rotando por hueco, la
  // semana se ve variada, que es como es un horario de verdad.
  const propuesta: ClasePropuesta[] = [];
  let i = 0;
  // El orden de `DIAS_SEMANA` manda (lunes primero), no el orden en que los
  // tocó: la propuesta se lee de lunes a domingo.
  const diasOrdenados = DIAS_SEMANA.filter((d) => dias.includes(d.dow)).map((d) => d.dow);
  for (const [diaIdx, dow] of diasOrdenados.entries()) {
    for (const inicio of horas) {
      // El `+ diaIdx` desplaza la rotación un tipo por día. Sin él, con dos
      // tipos y cuatro huecos la rotación vuelve a la misma fase cada día y
      // la semana entera sale idéntica.
      const clase = tipos[(i + diaIdx) % tipos.length];
      const sala = salaParaTipo(clase, salas);
      propuesta.push({
        clase,
        diaSemana: dow,
        horaInicio: aHHMM(inicio),
        horaFin: aHHMM(inicio + duracion),
        sala: sala?.nombre ?? null,
        aforo: sala?.capacidad ?? null,
        instructor,
      });
      i += 1;
    }
  }
  return propuesta;
}

/** Cuántas semanas se expanden al confirmar. Cuatro: un mes de horario es
 *  suficiente para abrir reservas sin llenarle el calendario hasta fin de año
 *  con clases que todavía no sabe si va a dar. */
export const SEMANAS_A_CREAR = 4;

/** Resumen legible de la propuesta, para el titular de la pantalla. */
export function resumirPropuesta(p: ClasePropuesta[]): { clases: number; dias: number; porSemana: number } {
  return {
    clases: p.length * SEMANAS_A_CREAR,
    dias: new Set(p.map((c) => c.diaSemana)).size,
    porSemana: p.length,
  };
}
