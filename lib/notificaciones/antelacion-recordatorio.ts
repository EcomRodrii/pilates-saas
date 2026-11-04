// Antelación del recordatorio de clase que elige cada estudio (client-safe: la
// usan el barrido de `recordatorio-clase.ts` y la pantalla de Configuración).
// Los valores están cerrados también por CHECK en `studios` (migr 20260921145514).

/** Antelación que eligió el estudio. Valores cerrados por CHECK: 12/24/48 h y 30/60/120 min. */
export interface AntelacionRecordatorio {
  largoHoras: number; cortoMinutos: number;
  /** El recordatorio largo (push + correo + WhatsApp) está encendido. Apagado, no sale NADA de él ni la franja tardía. */
  largoActivo: boolean;
  /** El recordatorio corto (push) está encendido. */
  cortoActivo: boolean;
}
export const ANTELACION_POR_DEFECTO: AntelacionRecordatorio = { largoHoras: 24, cortoMinutos: 60, largoActivo: true, cortoActivo: true };
export const ANTELACIONES_LARGO_HORAS = [12, 24, 48] as const;
export const ANTELACIONES_CORTO_MINUTOS = [30, 60, 120] as const;

/** Lo que lee la fila de `studios`; un valor fuera de lista (no debería pasar el CHECK) cae al de siempre. */
export function antelacionDeFila(f: {
  recordatorio_largo_horas?: number | null; recordatorio_corto_minutos?: number | null;
  recordatorio_largo_activo?: boolean | null; recordatorio_corto_activo?: boolean | null;
}): AntelacionRecordatorio {
  const largo = (ANTELACIONES_LARGO_HORAS as readonly number[]).includes(f.recordatorio_largo_horas ?? -1)
    ? f.recordatorio_largo_horas as number : ANTELACION_POR_DEFECTO.largoHoras;
  const corto = (ANTELACIONES_CORTO_MINUTOS as readonly number[]).includes(f.recordatorio_corto_minutos ?? -1)
    ? f.recordatorio_corto_minutos as number : ANTELACION_POR_DEFECTO.cortoMinutos;
  // Solo un `false` EXPLÍCITO apaga: sin la columna (migración sin aplicar) o con `null`, sigue encendido como siempre.
  return { largoHoras: largo, cortoMinutos: corto, largoActivo: f.recordatorio_largo_activo !== false, cortoActivo: f.recordatorio_corto_activo !== false };
}

/** «24 horas», «1 hora», «30 minutos»: la variable `{antelacion}` del texto del push. */
export function textoAntelacion(franja: '24h' | '1h', a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO): string {
  if (franja === '24h') return `${a.largoHoras} horas`;
  if (a.cortoMinutos < 60) return `${a.cortoMinutos} minutos`;
  const h = a.cortoMinutos / 60;
  return h === 1 ? '1 hora' : `${h} horas`;
}

/**
 * «falta 1 hora», «faltan 30 minutos»: la variable `{faltan}`, con el verbo ya
 * concordado. Escribir «faltan {antelacion}» a mano decía «faltan 1 hora» en
 * cuanto el estudio elegía la hora (visto en la prueba real del 21-sep).
 */
export function textoFaltan(franja: '24h' | '1h', a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO): string {
  const cuanto = textoAntelacion(franja, a);
  return `${cuanto.startsWith('1 ') ? 'falta' : 'faltan'} ${cuanto}`;
}
