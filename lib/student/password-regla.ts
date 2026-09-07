// Qué hace inválida una contraseña nueva. Sin imports ni `@/` (ver push-estado).
//
// ⚠️ El mínimo es el REAL del proyecto (`password_min_length` en la
// configuración de Supabase Auth). Decir 6 en pantalla y que el servidor exija
// 8 sería mandarla a fallar y hacerle adivinar por qué.

export const MINIMO_PASSWORD = 8;

export interface MotivoPassword {
  campo: 'nueva' | 'repetida';
  texto: string;
}

/** El motivo por el que no vale, o `null` si vale. */
export function motivoPasswordInvalida(nueva: string, repetida: string, actual: string): MotivoPassword | null {
  if (nueva.length < MINIMO_PASSWORD) {
    return { campo: 'nueva', texto: `Usa al menos ${MINIMO_PASSWORD} caracteres.` };
  }
  if (nueva !== repetida) {
    return { campo: 'repetida', texto: 'Las dos no coinciden.' };
  }
  // Cambiar por la misma no es un cambio: el servidor lo acepta sin rechistar,
  // así que sin esto se iría con un «cambiada ✓» sin haber cambiado nada.
  if (nueva === actual) {
    return { campo: 'nueva', texto: 'La nueva tiene que ser distinta de la actual.' };
  }
  return null;
}
