// «Tu progreso» (Inicio) y «Mis estadísticas» (Mi plan): cifras de SUS clases pasadas.
//
// ⚠️ La fuente es `POST /api/public/historial`, no el catálogo: el catálogo solo trae sesiones que no han terminado
// (`fetchPublicStudioData`, `fin >= ahora`), así que con él una clase pasada no existe y cualquier cifra de progreso
// sale a cero o a medias.
//
// ⚠️ Solo cuenta lo que el estudio MARCÓ: `ASISTIDA` es una clase hecha y `NO_SHOW` una a la que no fue. Una reserva
// confirmada cuya clase ya pasó no llega en el historial (el servidor la deja fuera a propósito: o no pasan lista o no
// fue), así que no se cuenta ni como hecha ni como falta. Decisión del fundador (19-oct-2026): sin objetivos inventados
// y nada de cifras que no salgan de datos reales; si no hay nada marcado, no se pinta una cifra, se dice que no hay.
//
// Sin `@/` ni imports: lo prueba `node --test` directamente (ver la nota de `ritmo.ts`).

export type EstadoHistorial = 'ASISTIDA' | 'CANCELADA' | 'NO_SHOW';

export interface ClaseDelHistorial {
  /** Instante de inicio (ISO con zona). */
  inicio: string;
  estado: EstadoHistorial;
}

export interface Estadisticas {
  /** Semanas que mide (la ventana). */
  semanas: number;
  /** Clases hechas (`ASISTIDA`) dentro de la ventana. */
  clases: number;
  /** Media de clases hechas por semana, con un decimal. */
  semanaMedia: number;
  /**
   * % de asistencia: hechas sobre hechas + faltas (`NO_SHOW`). `null` = no hay ninguna de las dos en la ventana, y
   * entonces no hay porcentaje que dar (un 0 % o un 100 % sin base mentiría).
   */
  asistencia: number | null;
}

const DIA_MS = 86_400_000;

/** Las cifras de las últimas `semanas` semanas hasta `ahoraMs`, ambos extremos incluidos. */
export function estadisticasRecientes(historial: readonly ClaseDelHistorial[], ahoraMs: number, semanas = 4): Estadisticas {
  const desde = ahoraMs - semanas * 7 * DIA_MS;
  let clases = 0;
  let faltas = 0;
  for (const c of historial) {
    const t = Date.parse(c.inicio);
    if (!Number.isFinite(t) || t < desde || t > ahoraMs) continue;
    if (c.estado === 'ASISTIDA') clases += 1;
    else if (c.estado === 'NO_SHOW') faltas += 1;
  }
  return {
    semanas,
    clases,
    semanaMedia: Math.round((clases / semanas) * 10) / 10,
    asistencia: clases + faltas === 0 ? null : Math.round((clases / (clases + faltas)) * 100),
  };
}

/**
 * Clases hechas en el mes de `hoyISO` (`YYYY-MM-DD`, el día del ESTUDIO). El mes se compara con el día del estudio de
 * cada clase, que es lo que la alumna entiende por «este mes»; `diaDe` lo da quien llama (la zona vive en `formato`).
 */
export function hechasEsteMes(historial: readonly ClaseDelHistorial[], hoyISO: string, diaDe: (inicio: string) => string): number {
  const mes = hoyISO.slice(0, 7);
  return historial.filter((c) => c.estado === 'ASISTIDA' && diaDe(c.inicio).slice(0, 7) === mes).length;
}

/** «8,5» y no «8.5»: la app habla en español. */
export function decimal(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
