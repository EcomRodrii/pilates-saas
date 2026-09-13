// La frase que la alumna escribe para confirmar que pide eliminar sus datos.
//
// Sin imports ni `@/`: la usan la hoja de la app (para habilitar el botón) y la
// ruta `POST /api/public/solicitud-derechos` (para no crear nada sin ella), y
// tiene que poder probarse con `node --test`. Si las dos compararan cada una a
// su manera, la pantalla dejaría enviar algo que el servidor luego rechaza.
//
// La comparación es tolerante con lo que NO cambia el significado —tildes,
// mayúsculas, espacios de más—, porque escribir «eliminacion» sin tilde en un
// móvil es lo normal y no es una duda. Lo que sí exige es la frase entera.

export const FRASE_CONFIRMACION_ELIMINACION = 'Solicitar la eliminación de mis datos';

export const ERROR_CONFIRMACION_ELIMINACION =
  `Para pedir que eliminen tus datos, escribe «${FRASE_CONFIRMACION_ELIMINACION}» para confirmar.`;

/** Nada razonable pasa de aquí; evita normalizar cuerpos enormes en el servidor. */
const TOPE = 200;

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const OBJETIVO = normalizar(FRASE_CONFIRMACION_ELIMINACION);

export function coincideFraseEliminacion(texto: unknown): boolean {
  if (typeof texto !== 'string' || texto.length > TOPE) return false;
  return normalizar(texto) === OBJETIVO;
}

/**
 * `null` si la solicitud puede crearse; si no, el mensaje del 400. Solo la
 * supresión pide confirmación escrita: limitar u oponerse no cambian.
 */
export function errorConfirmacionSolicitud(tipo: string, confirmacion: unknown): string | null {
  if (tipo !== 'supresion') return null;
  return coincideFraseEliminacion(confirmacion) ? null : ERROR_CONFIRMACION_ELIMINACION;
}
