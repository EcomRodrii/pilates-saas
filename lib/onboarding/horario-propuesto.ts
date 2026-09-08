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
}

export interface EntradaPropuesta {
  /** Días que abre, en DOW. Sin días no hay propuesta. */
  dias: number[];
  /** Franja del estudio, 'HH:MM:SS' o 'HH:MM'. */
  horaApertura?: string;
  horaCierre?: string;
  duracionMinutos?: number;
  tiposClase?: string[];
  /** Nombres de sala tal y como los crea `planificarConfiguracion`. */
  salas?: string[];
  aforoPorSala?: number;
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
 * ⚠️ HORAS REDONDAS Y EN DOS BLOQUES, y las dos cosas por el mismo motivo:
 * que el horario propuesto se parezca al de un estudio de verdad. La primera
 * versión colocaba las clases en los extremos exactos de la franja y salía
 * esto para 07:00–22:00: «07:00, 07:50, 21:10», con trece horas muertas en
 * medio y una clase acabando a las 22:00 clavadas. Nadie tiene ese horario.
 * Visto imprimiendo la propuesta, no leyendo el código.
 *
 * Un estudio real trabaja en dos picos —antes de la jornada y al salir— y en
 * horas redondas. Así que se proponen hasta dos clases al empezar la franja y
 * hasta dos al final, siempre en punto. Si la franja es corta (solo mañanas,
 * solo tardes) hay un único bloque, que es la respuesta correcta: son menos
 * horas.
 */
const MIN_PARA_DOS_BLOQUES = 6 * MIN_POR_HORA;

export function horasPropuestas(aperturaMin: number, cierreMin: number, duracion: number): number[] {
  const cabe = (inicio: number) => inicio >= aperturaMin && inicio + duracion <= cierreMin;
  // Hacia arriba desde la apertura y hacia abajo desde el cierre: en los dos
  // casos se busca la hora EN PUNTO más cercana que siga dentro de la franja.
  const enPuntoDesde = Math.ceil(aperturaMin / MIN_POR_HORA) * MIN_POR_HORA;
  const ultimaEnPunto = Math.floor((cierreMin - duracion) / MIN_POR_HORA) * MIN_POR_HORA;

  const horas = new Set<number>();
  if (cabe(enPuntoDesde)) horas.add(enPuntoDesde);
  if (cabe(enPuntoDesde + MIN_POR_HORA)) horas.add(enPuntoDesde + MIN_POR_HORA);

  if (cierreMin - aperturaMin >= MIN_PARA_DOS_BLOQUES) {
    if (cabe(ultimaEnPunto)) horas.add(ultimaEnPunto);
    if (cabe(ultimaEnPunto - MIN_POR_HORA)) horas.add(ultimaEnPunto - MIN_POR_HORA);
  }

  return [...horas].sort((a, b) => a - b);
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

  // Una sola sala en la propuesta aunque tenga varias: dos clases a la misma
  // hora en salas distintas es una decisión de aforo que ella no ha tomado, y
  // además `sesiones_sala_sin_solape` obliga a que cada sala tenga su hueco.
  // Con una sala, la propuesta nunca puede chocar consigo misma.
  const sala = (e.salas ?? [])[0] ?? null;

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
      propuesta.push({
        // El `+ diaIdx` desplaza la rotación un tipo por día. Sin él, con dos
        // tipos y cuatro huecos la rotación vuelve a la misma fase cada día y
        // la semana entera sale idéntica: lunes «Reformer, Mat, Reformer, Mat»
        // y martes exactamente igual. Con el desplazamiento, el martes empieza
        // por Mat y el horario se lee como el de un estudio, no como el de una
        // fórmula.
        clase: tipos[(i + diaIdx) % tipos.length],
        diaSemana: dow,
        horaInicio: aHHMM(inicio),
        horaFin: aHHMM(inicio + duracion),
        sala,
        aforo: e.aforoPorSala ?? null,
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
