// «Analizar ahora» sabe cuándo termina. Puro: lo usan POST /analizar, los dos
// GET (/api/decisiones y /analisis-en-curso), el análisis de Inngest y la
// pantalla, y se prueba sin base de datos (analisis-en-curso.test.ts).
//
// Antes, la pantalla recargaba a ciegas a los 4 s del 202, cuando un análisis
// tarda de media un minuto (medido: p95 61 s, máximo 82 s): recargaba sobre el
// análisis anterior y nunca se enteraba de cuándo había terminado el nuevo.
// Ahora POST /analizar crea la sesión (`decision_sessions`, MANUAL) ANTES de
// enviar el evento, el análisis la reutiliza y la cierra, y la pantalla pregunta.

/** Una sesión MANUAL sin cerrar cuenta como «en curso» durante 10 minutos: una
 *  que se quedó abierta (el análisis murió sin llegar a su `onFailure`) no deja
 *  la pantalla «analizando» para siempre. */
export const VENTANA_EN_CURSO_MS = 10 * 60_000;
/** Entre dos «Analizar ahora» del mismo estudio, como mínimo (antes ya era así). */
export const ESPERA_ENTRE_ANALISIS_MS = 5 * 60_000;
/** La pantalla pregunta cada 5 s, con un tope de 90 s (por encima del máximo medido). */
export const SONDEO_ANALISIS_MS = 5_000;
export const TOPE_SONDEO_ANALISIS_MS = 90_000;
/** Pasado el tope, la pantalla dice que tarda y sigue preguntando, pero cada 30 s. */
export const SONDEO_ANALISIS_TARDANDO_MS = 30_000;

export const TEXTO_ANALISIS_TARDANDO = 'Está tardando más de lo normal; te lo enseño cuando termine.';
export const TEXTO_YA_EN_MARCHA = 'Ya hay un análisis en marcha: te lo enseño cuando termine.';
export const TEXTO_ACABO_DE_ANALIZAR = 'Acabo de analizar tu estudio. Podrás pedirme otro en unos minutos.';
export const TEXTO_NO_SE_PUDO_LANZAR = 'No he podido poner en marcha el análisis. Vuelve a intentarlo en un momento.';

/** El instante (ISO) desde el que una sesión abierta cuenta como en curso. */
export function enCursoDesde(ahora: Date): string {
  return new Date(ahora.getTime() - VENTANA_EN_CURSO_MS).toISOString();
}

export interface SesionParaAnalizar {
  disparadoPor: string;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
}

/** ¿Esta sesión es un análisis que sigue en marcha? Abierta y de hace menos de 10 min. */
export function sigueEnCurso(s: SesionParaAnalizar, ahora: Date): boolean {
  if (s.finalizadoEn !== null || !s.iniciadoEn) return false;
  const t = Date.parse(s.iniciadoEn);
  return Number.isFinite(t) && t >= ahora.getTime() - VENTANA_EN_CURSO_MS;
}

/**
 * Qué responde POST /analizar con las sesiones recientes del estudio:
 *   · una abierta (de cualquier origen) → 429 «ya hay uno en marcha»;
 *   · una empezada hace menos de 5 min → 429 «acabo de analizar»;
 *   · si no, `null`: puede lanzar otro.
 * Solo una MANUAL es la que la pantalla puede seguir (`analisisEnCurso`), pero
 * dos análisis a la vez del mismo estudio no se lanzan sea cual sea el otro.
 */
export function motivoParaNoAnalizar(
  recientes: readonly SesionParaAnalizar[], ahora: Date,
): { error: string; enCurso: boolean } | null {
  if (recientes.some(s => sigueEnCurso(s, ahora))) return { error: TEXTO_YA_EN_MARCHA, enCurso: true };
  const corte = ahora.getTime() - ESPERA_ENTRE_ANALISIS_MS;
  if (recientes.some(s => s.iniciadoEn && Date.parse(s.iniciadoEn) >= corte)) return { error: TEXTO_ACABO_DE_ANALIZAR, enCurso: false };
  return null;
}

/**
 * Lo que trae el evento `decision/studio.analyze` sobre su sesión. Uno enviado
 * antes de este cambio no la lleva (`null`): el análisis la crea él, como antes.
 */
export function sesionDelEvento(data: unknown): string | null {
  const id = (data as { sessionId?: unknown } | null | undefined)?.sessionId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
