// Definición compartida (servidor + cliente) de la rejilla de disponibilidad de
// instructoras. La tabla `instructora_disponibilidad` guarda rangos reales
// (dia_semana 0-6 + hora_inicio/hora_fin), pero la UX de onboarding es una
// rejilla día × franja de toques (5 segundos, móvil). Cada franja mapea a un
// rango horario concreto que sí se persiste.
//
// dia_semana: 0=domingo..6=sábado, para casar con EXTRACT(DOW) del scoring (0038).

export type FranjaKey = 'manana' | 'media_manana' | 'tarde' | 'noche';

export interface Franja {
  key: FranjaKey;
  label: string;
  horaInicio: string; // 'HH:MM'
  horaFin: string;    // 'HH:MM'
}

// ⚠️ Cuatro franjas, no tres. «Mañana» era 06:00–14:00 de una pieza: una
// instructora que puede a las 12:00 pero no a las 09:00 no tenía forma de
// decirlo — marcaba la mañana entera y el motor la proponía para una clase que
// no podía cubrir. Dos fallos así y la propietaria deja de fiarse del ranking,
// que es justo lo que sostiene la funcionalidad estrella.
//
// El corte va a las 10:00 y a las 18:00 porque es donde de verdad se parte el
// día de un estudio de Pilates (primera hora antes de trabajar, media mañana,
// tarde, y la punta de después del trabajo). Siguen siendo un toque por celda y
// caben en la pantalla de un móvil.
export const FRANJAS: Franja[] = [
  { key: 'manana', label: 'Primera hora', horaInicio: '06:00', horaFin: '10:00' },
  { key: 'media_manana', label: 'Media mañana', horaInicio: '10:00', horaFin: '14:00' },
  { key: 'tarde', label: 'Tarde', horaInicio: '14:00', horaFin: '18:00' },
  { key: 'noche', label: 'Última hora', horaInicio: '18:00', horaFin: '23:59' },
];

export interface Dia {
  dow: number; // 0-6
  label: string;
  corto: string;
}

// Orden de presentación: lunes primero (aunque dow 0 sea domingo).
export const DIAS: Dia[] = [
  { dow: 1, label: 'Lunes', corto: 'L' },
  { dow: 2, label: 'Martes', corto: 'M' },
  { dow: 3, label: 'Miércoles', corto: 'X' },
  { dow: 4, label: 'Jueves', corto: 'J' },
  { dow: 5, label: 'Viernes', corto: 'V' },
  { dow: 6, label: 'Sábado', corto: 'S' },
  { dow: 0, label: 'Domingo', corto: 'D' },
];

// Clave de celda de la rejilla, p.ej. "1-manana" (lunes por la mañana).
export function celdaKey(dow: number, franja: FranjaKey): string {
  return `${dow}-${franja}`;
}

export function parseCeldaKey(clave: string): { dow: number; franja: FranjaKey } | null {
  const [dowStr, franja] = clave.split('-');
  const dow = Number(dowStr);
  if (!Number.isInteger(dow) || dow < 0 || dow > 6) return null;
  if (!FRANJAS.some((f) => f.key === franja)) return null;
  return { dow, franja: franja as FranjaKey };
}

// Mapea una hora_inicio de la BD ('HH:MM:SS' o 'HH:MM') a su franja.
//
// Por CONTENCIÓN y no por igualdad exacta: las disponibilidades guardadas con
// la rejilla vieja de tres franjas empiezan a las 06:00, 14:00 y 20:00, y esa
// última no coincide con el inicio de ninguna franja nueva. Con la comparación
// exacta de antes, una instructora que ya había marcado sus noches abría el
// enlace y se encontraba la rejilla en blanco, como si nunca hubiera contestado
// — y el estudio veía «todavía no ha respondido». La fila seguía en la base de
// datos y el ranking la seguía usando: solo desaparecía de la pantalla, que es
// la peor forma de perderse.
export function franjaPorHoraInicio(horaInicio: string): FranjaKey | null {
  const hhmm = horaInicio.slice(0, 5);
  const exacta = FRANJAS.find((f) => f.horaInicio === hhmm);
  if (exacta) return exacta.key;
  return FRANJAS.find((f) => hhmm >= f.horaInicio && hhmm < f.horaFin)?.key ?? null;
}
