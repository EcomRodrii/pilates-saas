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

/** Resultado de una escritura que la usuaria está esperando en pantalla. */
export type ResultadoEscritura = { ok: true } | { ok: false; error: string };

/**
 * Traduce un fallo de escritura a una frase que la dueña pueda entender Y
 * accionar.
 *
 * Antes TODO fallo —permisos, clave ajena, validación, sesión caducada— se
 * enseñaba con el mismo texto: "revisa tu conexión". Mentía sobre la causa
 * (casi nunca era la red) y la dejaba sin salida: reintentar no arreglaba nada
 * porque el problema no estaba en su wifi. Distinguir la causa es la diferencia
 * entre un aviso útil y un aviso que solo genera desconfianza.
 */
export function mensajeDeFalloAlGuardar(error: unknown): string {
  const e = (error ?? {}) as {
    code?: unknown; message?: unknown; error?: unknown; status?: unknown; name?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : 0;
  const msg =
    typeof e.message === 'string' ? e.message
    : typeof e.error === 'string' ? e.error
    : error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';

  // El ÚNICO caso en el que "revisa tu conexión" es verdad.
  if (e.name === 'AbortError' || /load failed|failed to fetch|networkerror|network request failed|the operation was aborted/i.test(msg)) {
    return ERROR_RED;
  }
  if (status === 401 || status === 403 || code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'No tienes permiso para hacer este cambio. Vuelve a entrar e inténtalo otra vez.';
  }
  if (code === '23505' || /duplicate key value/i.test(msg)) {
    return 'Ya existe algo con esos mismos datos. Cámbialos y vuelve a intentarlo.';
  }
  // 23503: la fila apunta a algo que no está guardado — el caso de la sala que
  // se veía en el selector pero nunca llegó a la base de datos.
  if (code === '23503' || /violates foreign key/i.test(msg)) {
    return 'Falta un dato relacionado: la sala o el tipo de clase que has elegido no está guardado. Vuelve a crearlo y repite.';
  }
  if (code === '23502' || /null value in column/i.test(msg)) {
    return 'Falta algún campo obligatorio.';
  }
  if (code === '23514' || /violates check constraint/i.test(msg)) {
    return 'Alguno de los datos no es válido. Revísalo y vuelve a intentarlo.';
  }
  // 23P01: violación de exclusión (GiST anti-solape de sala/instructora). Es el
  // motivo típico de que mover una clase a otra hora no llegue a guardarse.
  if (code === '23P01' || /exclusion constraint|conflicting key value/i.test(msg)) {
    return 'Esa sala o instructora ya tiene una clase a esa hora. Elige otro hueco.';
  }
  if (status >= 400) return mensajeHttp(status);
  // Si el servidor mandó una frase apta para una persona, es mejor que la nuestra.
  return mensajeSeguro(msg, ERROR_GENERICO);
}

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
