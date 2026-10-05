// ─────────────────────────────────────────────────────────────────────────────
// Quién le escribe a la alumna, en el aviso de un mensaje nuevo. Puro: lo usa
// `emitirMensajeRecibido` (emit.ts) y se prueba sin levantar nada.
// ─────────────────────────────────────────────────────────────────────────────

/** Si no hay nombre que poner: mejor esto que « te ha escrito.». */
export const QUIEN_ESCRIBE_POR_DEFECTO = 'Tu estudio';

/**
 * En el hilo con el estudio (ALUMNA_MOSTRADOR) le escribe el ESTUDIO: contesta
 * quien esté en recepción, y a la alumna no le dice nada «Marta López te ha
 * escrito» (ni tiene por qué ver el nombre completo de quien atiende). En el
 * resto, quien escribe (su instructora).
 */
export function quienEscribeALaAlumna(tipo: string | null, remitente: string | null, nombreEstudio: string | null): string {
  const nombre = tipo === 'ALUMNA_MOSTRADOR' ? nombreEstudio : remitente;
  return nombre?.trim() || QUIEN_ESCRIBE_POR_DEFECTO;
}
