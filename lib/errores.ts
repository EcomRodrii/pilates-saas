// Mensajes de error que ve el usuario.
//
// Regla: una dueña de estudio nunca debe leer jerga de base de datos. Nada de
// "duplicate key value violates unique constraint", ni "JWT expired", ni
// "Failed to fetch". Si no puede entenderlo y actuar, no sirve como mensaje.
//
// La defensa es doble, a propósito:
//
//   1. En el SERVIDOR (lib/errores-servidor.ts) cada ruta registra el error
//      completo en el log y devuelve una frase en español. Esta es la buena.
//   2. Aquí, en el CLIENTE, hay una red de seguridad: si aun así llega algo con
//      pinta de mensaje de máquina, se sustituye por el texto de respaldo.
//
// La capa 2 es una red, no el arreglo. Es una lista negra y las listas negras
// siempre se quedan cortas; su trabajo es que un descuido futuro no acabe en la
// pantalla de una clienta, no ahorrarnos hacer bien la capa 1.

// Huellas de error de Postgres/PostgREST, de la capa de red y de JavaScript.
const HUELLAS_TECNICAS: RegExp[] = [
  // Postgres / PostgREST / Supabase
  /duplicate key value/i,
  /violates .*constraint/i,
  /null value in column/i,
  /row-level security/i,
  /permission denied/i,
  /invalid input syntax/i,
  /syntax error at/i,
  /relation "[^"]+" does not exist/i,
  /column "[^"]+"/i,
  /function [\w.]+\([^)]*\) does not exist/i,
  /\bPGRST\d+\b/,
  /\bJWT\b/,
  // Red / fetch
  /failed to fetch/i,
  /networkerror/i,
  /fetch failed/i,
  /\bECONN\w+/,
  /\bETIMEDOUT\b/,
  // JavaScript
  /\b(Type|Reference|Syntax|Range)Error\b/,
  /cannot read propert/i,
  /is not a function/i,
  /undefined is not/i,
  /unexpected token/i,
];

/** ¿Esto parece escrito para una máquina en vez de para una persona? */
export function esMensajeTecnico(mensaje: unknown): boolean {
  if (typeof mensaje !== 'string') return true;
  const m = mensaje.trim();
  if (!m) return true;
  // Un volcado de JSON o una traza de pila nunca son un mensaje de usuario.
  if (m.startsWith('{') || m.startsWith('[') || /\n\s*at\s/.test(m)) return true;
  return HUELLAS_TECNICAS.some(re => re.test(m));
}

/**
 * Devuelve `bruto` solo si es apto para enseñarlo; si no, el texto de respaldo.
 * Úsalo en TODO punto donde un mensaje del servidor acabe en pantalla.
 */
export function mensajeSeguro(bruto: unknown, respaldo: string): string {
  return esMensajeTecnico(bruto) ? respaldo : (bruto as string).trim();
}

/** Respaldo genérico, cuando quien llama no tiene uno más concreto. */
export const ERROR_GENERICO =
  'No se ha podido completar la operación. Inténtalo de nuevo en unos segundos.';

/** Respaldo para fallos de red desde el navegador. */
export const ERROR_RED =
  'No hay conexión con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.';

/**
 * Respaldo a partir del código HTTP. Sustituye a los "Error HTTP 500" que se
 * usaban de reserva: un número de estado no le dice nada a nadie, y encima
 * aparecía justo cuando el mensaje del servidor ya había fallado.
 */
export function mensajeHttp(status: number): string {
  if (status === 401 || status === 403) {
    return 'Tu sesión ha caducado o no tienes permiso para hacer esto. Vuelve a entrar e inténtalo otra vez.';
  }
  if (status === 404) return 'No se ha encontrado. Puede que se haya eliminado desde otro dispositivo.';
  if (status === 409) return 'Alguien ha cambiado esto mientras lo editabas. Recarga la página y repite la operación.';
  if (status === 413) return 'El archivo es demasiado grande.';
  if (status === 429) return 'Demasiados intentos seguidos. Espera unos segundos e inténtalo de nuevo.';
  return ERROR_GENERICO;
}
