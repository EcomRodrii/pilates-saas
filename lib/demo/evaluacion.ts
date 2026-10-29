// Las cuatro respuestas de «¿Hemos resuelto tu duda?» y la nota estructurada
// que dejan en el lead. Sin texto libre de la persona: solo claves cerradas.
import type { TipoCentro } from './centros.ts';

export const RESPUESTAS_EVALUACION = ['resuelta', 'otra_duda', 'otro_ejemplo', 'no_exacto'] as const;
export type RespuestaEvaluacion = (typeof RESPUESTAS_EVALUACION)[number];

export function esRespuestaEvaluacion(x: unknown): x is RespuestaEvaluacion {
  return typeof x === 'string' && (RESPUESTAS_EVALUACION as readonly string[]).includes(x);
}

/** Cuánto le ha ayudado la demo (las tres caritas): 1 poco, 2 bastante, 3 muchísimo. */
export type Utilidad = 1 | 2 | 3;
export function esUtilidad(x: unknown): x is Utilidad {
  return x === 1 || x === 2 || x === 3;
}

export function notaDeEvaluacion(centro: TipoCentro, escenario: string | null, respuesta: RespuestaEvaluacion, utilidad?: Utilidad): string {
  return `[demo] centro=${centro} escenario=${escenario ?? 'ninguno'} respuesta=${respuesta}${utilidad ? ` utilidad=${utilidad}` : ''}`;
}
