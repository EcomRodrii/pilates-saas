// La semana ficticia de la demo. Fija (un lunes cualquiera de invierno, fuera
// del cambio de hora) para que la misma demo dé siempre el mismo resultado: la
// demo no depende del día en que se mire.

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
export type Dia = (typeof DIAS)[number];

export const ETIQUETA_DIA: Record<Dia, string> = {
  lunes: 'lunes', martes: 'martes', miercoles: 'miércoles', jueves: 'jueves',
  viernes: 'viernes', sabado: 'sábado', domingo: 'domingo',
};

/** Lunes de la semana ficticia. */
export const LUNES_DEMO = '2026-11-02';
/** Hora de la clase de ejemplo, hora de Madrid (en noviembre, +01:00). */
export const HORA_CLASE = '18:00';

export function indiceDia(d: Dia): number {
  return DIAS.indexOf(d);
}

export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function fechaDeDia(d: Dia, base: string = LUNES_DEMO): string {
  return sumarDias(base, indiceDia(d));
}

/** Instante de inicio de la clase de ese día. */
export function inicioClaseISO(d: Dia): string {
  return `${fechaDeDia(d)}T${HORA_CLASE}:00+01:00`;
}

/** El día (YYYY-MM-DD, Madrid) de un instante. */
export function diaMadrid(instante: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(instante);
}

/** «miércoles 4 nov» */
export function etiquetaFecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  const dia = DIAS[(f.getUTCDay() + 6) % 7];
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1];
  return `${ETIQUETA_DIA[dia]} ${d} ${mes}`;
}

/** «24 h antes», «1 día antes»… sin decimales raros. */
export function haceCuanto(horas: number): string {
  if (horas >= 48 && horas % 24 === 0) return `${horas / 24} días antes`;
  if (horas === 24) return '1 día antes';
  return `${horas} h antes`;
}
