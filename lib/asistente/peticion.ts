// El cuerpo de POST /api/asistente y cómo se liquida una pregunta en el libro.
// Puro: se prueba con `node --test`.

import { COSTE_MAX_PREGUNTA_USD, MAX_CHARS_PREGUNTA } from './limites.ts';
import { costeUsd, type UsoAcumulado } from './coste.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Caracteres de control salvo el salto de línea y el tabulador.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type CuerpoValido = { ok: true; conversacionId: string | null; pregunta: string } | { ok: false; error: string };

/** `{ conversacionId?: uuid, pregunta: 1..500 caracteres }`. Nada más: ni estudio, ni rol, ni historial. */
export function validarCuerpo(body: unknown): CuerpoValido {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Cuerpo no válido' };
  const b = body as Record<string, unknown>;
  const pregunta = typeof b.pregunta === 'string' ? b.pregunta.trim() : '';
  if (!pregunta || pregunta.length > MAX_CHARS_PREGUNTA) return { ok: false, error: `La pregunta tiene que tener entre 1 y ${MAX_CHARS_PREGUNTA} caracteres` };
  if (CONTROL.test(pregunta)) return { ok: false, error: 'La pregunta lleva caracteres no válidos' };
  let conversacionId: string | null = null;
  if (b.conversacionId !== undefined && b.conversacionId !== null) {
    if (typeof b.conversacionId !== 'string' || !UUID.test(b.conversacionId)) return { ok: false, error: 'Conversación no válida' };
    conversacionId = b.conversacionId;
  }
  return { ok: true, conversacionId, pregunta };
}

export interface Liquidacion {
  estado: 'CONSUMIDA' | 'FALLIDA' | 'LIBERADA';
  costeUsd: number;
  codigoError: string | null;
}

/**
 * Cómo se cierra la consulta en `ia_consumos` según cómo acabó el turno. Las
 * unidades las decide `ia_cerrar_consulta` (SQL); aquí solo el estado y el coste:
 *   - respondida (también «demasiado amplia» o rechazada): CONSUMIDA, coste real;
 *   - Anthropic no respondió nunca: LIBERADA, 0 $;
 *   - falló a medias: FALLIDA con lo gastado (0 unidades a la clienta: se le
 *     dice «no se ha descontado ninguna consulta», y es verdad);
 *   - cortada por la propietaria: FALLIDA con el máximo (la última llamada no
 *     llegó a decir lo que costó; conservador). 0 unidades a la clienta.
 */
export function liquidar(motivo: string, uso: UsoAcumulado): Liquidacion {
  const coste = costeUsd(uso);
  switch (motivo) {
    case 'OK': case 'ACLARACION': case 'DEMASIADO_AMPLIA': case 'RECHAZADA':
      return { estado: 'CONSUMIDA', costeUsd: coste, codigoError: motivo === 'RECHAZADA' ? 'RECHAZADA' : null };
    case 'ABORTADA':
      return { estado: 'FALLIDA', costeUsd: Math.max(coste, COSTE_MAX_PREGUNTA_USD), codigoError: 'ABORTADA' };
    default:
      return coste > 0
        ? { estado: 'FALLIDA', costeUsd: coste, codigoError: motivo }
        : { estado: 'LIBERADA', costeUsd: 0, codigoError: motivo };
  }
}
