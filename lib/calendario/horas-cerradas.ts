// Las horas en que el estudio está CERRADO ese día, para pintarlas en la rejilla.
//
// POR QUÉ: el horario se guarda por día (el lunes abre a las 9, el martes a las
// 8), pero la rejilla del Día tiene UN eje de horas, el de la apertura más
// temprana de la semana. Si el martes abre a las 8 y el lunes a las 9, el lunes
// las 8:00 se veían como una hora libre cualquiera y nada decía «cerrado». Aquí
// se calcula qué tramos del eje caen fuera del horario de ESE día.

export interface HorarioDiaCalendario {
  abierto: boolean;
  /** Minutos desde medianoche. `null` en un día cerrado. */
  aperturaMin: number | null;
  cierreMin: number | null;
}

export interface TramoCerrado {
  desdeMin: number;
  hastaMin: number;
  /** El día entero: no abre. */
  diaEntero: boolean;
}

/**
 * Tramos de `[ejeDesdeMin, ejeHastaMin]` en que el estudio está cerrado.
 * Sin dato del día (`undefined`) NO se afirma nada: «cerrado» sin dato real
 * sería inventárselo (mismo criterio que `cerrado` en lib/calendario-columnas.ts).
 */
export function tramosCerrados(
  horario: HorarioDiaCalendario | undefined, ejeDesdeMin: number, ejeHastaMin: number,
): TramoCerrado[] {
  if (!horario || ejeHastaMin <= ejeDesdeMin) return [];
  if (!horario.abierto) return [{ desdeMin: ejeDesdeMin, hastaMin: ejeHastaMin, diaEntero: true }];
  const { aperturaMin, cierreMin } = horario;
  if (aperturaMin == null || cierreMin == null) return [];
  const tramos: TramoCerrado[] = [];
  if (aperturaMin > ejeDesdeMin) {
    tramos.push({ desdeMin: ejeDesdeMin, hastaMin: Math.min(aperturaMin, ejeHastaMin), diaEntero: false });
  }
  if (cierreMin < ejeHastaMin) {
    tramos.push({ desdeMin: Math.max(cierreMin, ejeDesdeMin), hastaMin: ejeHastaMin, diaEntero: false });
  }
  return tramos.filter(t => t.hastaMin > t.desdeMin);
}

/** «HH:MM:SS» o «HH:MM» → minutos desde medianoche; `null` si no es una hora. */
export function minutosDeHora(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? '');
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 24 && min < 60 ? h * 60 + min : null;
}
