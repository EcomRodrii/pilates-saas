// Las cuatro respuestas de «¿Hemos resuelto tu duda?» y la nota estructurada
// que dejan en el lead. Sin texto libre de la persona: solo claves cerradas.
import type { TipoCentro } from './centros.ts';

export const RESPUESTAS_EVALUACION = ['resuelta', 'otra_duda', 'otro_ejemplo', 'no_exacto'] as const;
export type RespuestaEvaluacion = (typeof RESPUESTAS_EVALUACION)[number];

export function esRespuestaEvaluacion(x: unknown): x is RespuestaEvaluacion {
  return typeof x === 'string' && (RESPUESTAS_EVALUACION as readonly string[]).includes(x);
}

export function notaDeEvaluacion(centro: TipoCentro, escenario: string | null, respuesta: RespuestaEvaluacion): string {
  return `[demo] centro=${centro} escenario=${escenario ?? 'ninguno'} respuesta=${respuesta}`;
}
