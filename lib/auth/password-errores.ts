// Por qué el servicio de cuentas (gotrue) rechaza una contraseña, dicho en el
// idioma del producto. Sin `@/` (lo leen `node --test` y los textos de la app).
//
// ⚠️ Esto existe porque dos traducciones decían, ante CUALQUIER error que
// contuviera la palabra «password», que la contraseña era demasiado corta
// («al menos 6 caracteres»; el servidor exige 8). El 9-oct-2026 el alta de un
// estudio nuevo respondía eso a quien probaba una contraseña larga y rara, y el
// motivo real, en los registros del servicio, era otro: «Password is known to be
// weak and easy to guess» (la protección contra contraseñas filtradas, que
// compara con listas de brechas). Quien lo veía no tenía forma de adivinarlo, y
// el alta de la campaña no se completaba.
//
// Por eso aquí se distingue el MOTIVO, con `reasons` cuando gotrue lo manda
// (`weak_password`: 'length' | 'characters' | 'pwned') y con el texto cuando no.
// Si no es un fallo de contraseña conocido devuelve `null` y quien llama decide:
// aquí no se inventa un motivo.

import { MINIMO_PASSWORD } from '../student/password-regla.ts';

export interface ErrorDeContrasena {
  message?: string;
  code?: string;
  /** `weak_password` de gotrue: por qué se rechaza. */
  reasons?: readonly string[];
}

export const TEXTO_PASSWORD_FILTRADA =
  'Esa contraseña es demasiado común o ha aparecido en filtraciones de datos, y por seguridad no la aceptamos. Elige otra distinta; una frase larga que solo tú conozcas funciona bien.';

export const TEXTO_PASSWORD_IGUAL = 'La contraseña nueva tiene que ser distinta de la actual.';

export const TEXTO_PASSWORD_CARACTERES =
  'Esa contraseña no cumple los requisitos de seguridad. Mezcla mayúsculas, minúsculas, números o símbolos.';

export function textoPasswordCorta(minimo: number): string {
  return `La contraseña es demasiado corta. Usa al menos ${minimo} caracteres.`;
}

/** El mínimo que cita gotrue («should be at least 8 characters»), o el del proyecto. */
function minimoDe(m: string): number {
  const n = Number(/at least (\d+) character/.exec(m)?.[1]);
  return Number.isInteger(n) && n > 0 ? n : MINIMO_PASSWORD;
}

/**
 * El mensaje para un fallo de contraseña de gotrue, o `null` si el error no es
 * de contraseña (o no lo reconocemos).
 */
export function mensajeDePassword(error: ErrorDeContrasena): string | null {
  const m = (error.message ?? '').toLowerCase();
  const motivos = error.reasons ?? [];

  // Cambiar por la misma: no es un fallo de la contraseña en sí.
  if (error.code === 'same_password' || m.includes('different from the old password')) return TEXTO_PASSWORD_IGUAL;

  // Filtrada o demasiado común: la protección contra contraseñas expuestas.
  if (motivos.includes('pwned') || m.includes('known to be weak') || m.includes('easy to guess') || m.includes('pwned')) {
    return TEXTO_PASSWORD_FILTRADA;
  }

  // «at least 8 characters» (con NÚMERO): «at least one character of each» es el
  // de los requisitos de caracteres, más abajo.
  if (motivos.includes('length') || (m.includes('password') && /at least \d+ character/.test(m))) {
    return textoPasswordCorta(minimoDe(m));
  }

  if (motivos.includes('characters') || m.includes('should contain at least one character of each')) {
    return TEXTO_PASSWORD_CARACTERES;
  }

  // `weak_password` sin motivo que reconozcamos: lo más cercano y honesto.
  if (error.code === 'weak_password' || m.includes('weak password')) return TEXTO_PASSWORD_FILTRADA;

  return null;
}
