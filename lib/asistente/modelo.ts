// El modelo del asistente y sus precios. Una sola constante: si algún día
// cambia, cambia aquí y en ningún otro sitio (el libro guarda el modelo de cada
// consulta, así que el histórico no se reescribe).
//
// Haiku 5.5, sin thinking: las cuentas las hacen las herramientas, no el modelo
// (lib/asistente/herramientas). Pensar solo añadiría latencia, coste y bloques
// que habría que reenviar con cada resultado de herramienta (el bucle no los
// guarda). Haiku 5.5 piensa por defecto (adaptativo, esfuerzo `medium`), así que
// se apaga de forma EXPLÍCITA: `thinking: { type: 'disabled' }` lo acepta hasta
// el esfuerzo `high`.
//
// Haiku 5.5 rechaza con un 400 `temperature` distinta de 1 (también `top_p` y
// `top_k`): no se envía. Haiku 4.5 (el respaldo) sí la acepta y se queda con 0,2.

export const MODELO_ASISTENTE = 'claude-haiku-5-5';
/** Si la API contesta «modelo no encontrado / sin acceso / sin capacidad», se reintenta con este (misma pregunta, mismo historial). */
export const MODELO_RESPALDO = 'claude-haiku-4-5';

/** Dólares por millón de tokens. Escribir en caché: 1,25× con TTL de 5 minutos, 2× con TTL de una hora. */
export interface Precios {
  entrada: number;
  salida: number;
  escrituraCache: number;
  escrituraCache1h: number;
  lecturaCache: number;
}

/** Haiku 4.5. Sigue aquí: las consultas ya cerradas con este modelo se explican con SUS precios. */
export const PRECIOS_HAIKU_45: Precios = {
  entrada: 1,
  salida: 5,
  escrituraCache: 1.25,
  escrituraCache1h: 2,
  lecturaCache: 0.1,
};

/**
 * Haiku 5.5 (platform.claude.com/docs/en/about-claude/pricing, 20-oct-2026).
 * Dos tarifas según el tamaño del PROMPT de cada petición (entrada + caché leída
 * + caché escrita): hasta 100.000 tokens, la corriente; por encima, la larga.
 */
export const PRECIOS_HAIKU_55: Precios = {
  entrada: 0.1,
  salida: 0.5,
  escrituraCache: 0.125,
  escrituraCache1h: 0.2,
  lecturaCache: 0.01,
};
export const PRECIOS_HAIKU_55_LARGO: Precios = {
  entrada: 0.5,
  salida: 2.5,
  escrituraCache: 0.625,
  escrituraCache1h: 1,
  lecturaCache: 0.05,
};
export const UMBRAL_PROMPT_LARGO_HAIKU_55 = 100_000;

/** Los precios por modelo: el libro conserva el de cada consulta, y el coste de una consulta antigua se calcula con los suyos. */
export const PRECIOS_POR_MODELO: Readonly<Record<string, { base: Precios; largo?: { desdeTokens: number; precios: Precios } }>> = {
  'claude-haiku-4-5': { base: PRECIOS_HAIKU_45 },
  'claude-haiku-5-5': { base: PRECIOS_HAIKU_55, largo: { desdeTokens: UMBRAL_PROMPT_LARGO_HAIKU_55, precios: PRECIOS_HAIKU_55_LARGO } },
};

/**
 * Los precios de un modelo para un prompt de `tokensPrompt` tokens. Un modelo que
 * no está en la tabla lanza: un coste inventado en el libro es peor que un error.
 */
export function preciosDe(modelo: string, tokensPrompt = 0): Precios {
  const p = PRECIOS_POR_MODELO[modelo];
  if (!p) throw new Error(`Sin precios para el modelo ${modelo}`);
  return p.largo && tokensPrompt > p.largo.desdeTokens ? p.largo.precios : p.base;
}

/** Haiku 4.5 (el respaldo) acepta la temperatura; Haiku 5.5 solo el valor 1, así que no se manda. */
export const TEMPERATURA_HAIKU_45 = 0.2;

/** Lo que cambia de una petición según el modelo. Puro. */
export function parametrosDelModelo(modelo: string): { temperature?: number; thinking?: { type: 'disabled' } } {
  if (modelo === 'claude-haiku-4-5') return { temperature: TEMPERATURA_HAIKU_45 };
  return { thinking: { type: 'disabled' } };
}

/**
 * Tope de salida por petición. Una respuesta buena es de ≤ 80 palabras (~150
 * tokens) y una petición de herramientas, ~60: 600 deja margen de sobra para
 * terminar la frase y corta antes a un modelo que se enrolla (el peor caso de
 * salida de una pregunta pasa de 6 × 1.024 a 6 × 600 tokens). Con el tokenizador
 * de Haiku 5.5 (~30 % más tokens por el mismo texto) cabe algo menos de texto:
 * subirlo es una propuesta aparte (tenti-propuesta-limites), no un cambio de aquí.
 */
export const MAX_TOKENS_RESPUESTA = 600;
