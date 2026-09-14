// El perfil de la instructora en la app del estudio: sus ausencias, su tarifa y
// sus estudios. Tipos y reglas PURAS (sin imports): lo prueba el runner de Node
// y lo comparten el servidor y las pantallas.

export type TipoAusencia = 'VACACIONES' | 'BAJA_MEDICA' | 'OTRO';

export const TIPOS_AUSENCIA_APP: ReadonlyArray<{ valor: TipoAusencia; etiqueta: string }> = [
  { valor: 'VACACIONES', etiqueta: 'Vacaciones' },
  { valor: 'BAJA_MEDICA', etiqueta: 'Baja médica' },
  { valor: 'OTRO', etiqueta: 'Otro motivo' },
];

export function etiquetaTipoAusencia(tipo: string): string {
  return TIPOS_AUSENCIA_APP.find((t) => t.valor === tipo)?.etiqueta ?? 'Ausencia';
}

/** Una ausencia suya. Sin `instructorId`: en la app todas son de ella. */
export interface AusenciaVista {
  id: string;
  tipo: TipoAusencia;
  desde: string;
  hasta: string;
  motivo: string | null;
}

export interface EstudioDeInstructora {
  nombre: string;
  slug: string;
  /** El estudio de la app que tiene abierta. */
  actual: boolean;
}

/** Solo lectura: la tarifa la fija el estudio (#562). */
export interface TarifaVista {
  tarifaHora: number | null;
  baseMensualEur: number | null;
}

export interface PerfilInstructora {
  estudios: EstudioDeInstructora[];
  tarifa: TarifaVista | null;
}

/** El mismo tope que el servidor (`lib/sustituciones/ausencias-servidor.ts`). */
export const MAX_DIAS_AUSENCIA = 366;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que está mal en un rango de fechas, dicho para ella, o `null`.
 * El servidor lo vuelve a comprobar: esto solo evita un viaje para nada.
 */
export function errorRangoAusencia(desde: string, hasta: string): string | null {
  if (!RE_FECHA.test(desde) || !RE_FECHA.test(hasta)) return 'Elige las dos fechas.';
  if (hasta < desde) return 'La fecha de fin no puede ser anterior a la de inicio.';
  const diasIncluidos = (Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000 + 1;
  if (diasIncluidos > MAX_DIAS_AUSENCIA) return 'Como mucho puede durar un año.';
  return null;
}

/** Las que aún no han terminado, de la más próxima a la más lejana. */
export function ausenciasVigentes<T extends { desde: string; hasta: string }>(ausencias: readonly T[], hoy: string): T[] {
  return ausencias.filter((a) => a.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
}

/**
 * El aviso tras guardar. Si tiene clases en esas fechas, se lo dice y le dice
 * qué hacer: una ausencia NO pide la baja de sus clases (#558), la pide ella
 * desde cada una.
 */
export function textoAusenciaGuardada(clasesAfectadas: number): string {
  if (!clasesAfectadas) return 'Ausencia guardada';
  const clases = clasesAfectadas === 1 ? '1 clase' : `${clasesAfectadas} clases`;
  return `Ausencia guardada. Tienes ${clases} en esas fechas: pide la baja desde cada una si necesitas que alguien la cubra.`;
}
