// Una emoción de Tenti, una vez al día en este dispositivo.
//
// Las emociones de la tira de Hoy (amor, orgullo, guiño) cuentan algo del DÍA:
// verlas cada vez que se vuelve a Resumen las convertiría en un tic. Se
// recuerda en localStorage, con una clave por emoción y estudio y el día del
// estudio como valor (una sola entrada por emoción: no se acumula una por día).
//
// Puro (el almacén se pasa): lo prueba node --test. Si el almacenamiento falla
// (navegación privada, bloqueado), NO toca: mejor sin emoción que una en cada
// visita.

export interface AlmacenDia {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

/** La clave de una emoción en un estudio. */
export const claveEmocion = (emocion: string, studioId: string) => `tenti-${emocion}-${studioId}`;

/**
 * Si a esta emoción le toca salir hoy ('YYYY-MM-DD' del estudio). Si toca, lo
 * apunta: la siguiente llamada del mismo día devuelve false.
 */
export function tocaHoy(clave: string, hoy: string, almacen: AlmacenDia | null): boolean {
  if (!almacen) return false;
  try {
    if (almacen.getItem(clave) === hoy) return false;
    almacen.setItem(clave, hoy);
    // Si no se ha podido apuntar de verdad, saldría en cada visita: no.
    return almacen.getItem(clave) === hoy;
  } catch {
    return false;
  }
}

/** localStorage, o null si no se puede ni pedir. */
export function almacenLocal(): AlmacenDia | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
