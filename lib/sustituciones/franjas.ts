// Definición compartida (servidor + cliente) de la rejilla de disponibilidad de
// instructoras. La tabla `instructora_disponibilidad` guarda rangos reales
// (dia_semana 0-6 + hora_inicio/hora_fin), pero la UX de onboarding es una
// rejilla día × franja de toques (5 segundos, móvil). Cada franja mapea a un
// rango horario concreto que sí se persiste.
//
// dia_semana: 0=domingo..6=sábado, para casar con EXTRACT(DOW) del scoring (0038).

export type FranjaKey = 'manana' | 'tarde' | 'noche';

export interface Franja {
  key: FranjaKey;
  label: string;
  horaInicio: string; // 'HH:MM'
  horaFin: string;    // 'HH:MM'
}

export const FRANJAS: Franja[] = [
  { key: 'manana', label: 'Mañana', horaInicio: '06:00', horaFin: '14:00' },
  { key: 'tarde', label: 'Tarde', horaInicio: '14:00', horaFin: '20:00' },
  { key: 'noche', label: 'Noche', horaInicio: '20:00', horaFin: '23:59' },
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
export function franjaPorHoraInicio(horaInicio: string): FranjaKey | null {
  const hhmm = horaInicio.slice(0, 5);
  return FRANJAS.find((f) => f.horaInicio === hhmm)?.key ?? null;
}
