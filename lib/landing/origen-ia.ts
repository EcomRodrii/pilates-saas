// ¿Llega esta visita desde un asistente de IA? Pura y sin DOM: se prueba con `node --test`.
//
// Por qué: hoy no se sabe si ChatGPT, Perplexity, Gemini, Claude o Copilot envían estudios. PostHog ya recibe `$referrer` y `utm_*`
// (saneados), pero con `persistence: 'memory'` cada carga es una sesión nueva: el referrer de la guía por la que entró no llega al alta.
// Se clasifica UNA vez al llegar, se deja una etiqueta en `sessionStorage` y el alta la lee (como `CLAVE_ORIGEN_ALTA`).
//
// Dos señales, y por qué las dos: el `Referer` que mandan estos sitios (cuando lo mandan: la app móvil de ChatGPT, por ejemplo, a veces
// no) y `utm_source`, que ChatGPT añade a los enlaces que cita. NO se mira nada más (ni el user-agent ni la IP): una etiqueta de origen,
// nunca un dato de la persona. Un modelo que cita Tentare sin enlace no deja rastro aquí: esto mide visitas, no menciones.

export type MotorIA = 'chatgpt' | 'perplexity' | 'gemini' | 'claude' | 'copilot';

/** La etiqueta que se deja en `sessionStorage` para el alta. */
export const CLAVE_ORIGEN_IA = 'tentare:origen-ia';

const POR_HOST: ReadonlyArray<readonly [RegExp, MotorIA]> = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)gemini\.google\.com$/, 'gemini'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)(copilot\.microsoft\.com|copilot\.cloud\.microsoft)$/, 'copilot'],
];

const POR_UTM: ReadonlyArray<readonly [RegExp, MotorIA]> = [
  [/chatgpt|openai/, 'chatgpt'],
  [/perplexity/, 'perplexity'],
  [/gemini/, 'gemini'],
  [/claude/, 'claude'],
  [/copilot/, 'copilot'],
];

export function motorDeIA(referrer: string | null | undefined, utmSource?: string | null): MotorIA | null {
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      const hallado = POR_HOST.find(([re]) => re.test(host));
      if (hallado) return hallado[1];
    } catch { /* referrer que no es una URL: se ignora */ }
  }
  const utm = (utmSource ?? '').trim().toLowerCase();
  if (utm) return POR_UTM.find(([re]) => re.test(utm))?.[1] ?? null;
  return null;
}
