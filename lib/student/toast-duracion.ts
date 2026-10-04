// Cuánto se queda en pantalla un aviso emergente (`Toast`). Puro
// (toast-duracion.test.ts).
//
// Eran 2,3 s fijos para cualquier texto. «Marcadas como leídas ✓» se lee en eso;
// «Alguien se te adelantó por segundos — te hemos dado una clase de
// recuperación.» no, y no se puede releer. Unos 60 ms por carácter es un ritmo
// de lectura pausado; nunca menos de lo que había ni más de 7 s.

export const TOAST_MIN_MS = 2300;
export const TOAST_MAX_MS = 7000;
const MS_POR_CARACTER = 60;

export function duracionToast(mensaje: string): number {
  const n = Array.from(mensaje.trim()).length;
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, n * MS_POR_CARACTER));
}
