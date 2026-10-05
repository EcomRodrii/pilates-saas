// El modelo del asistente y sus precios. Una sola constante: si algún día
// cambia, cambia aquí y en ningún otro sitio (el libro guarda el modelo de cada
// consulta, así que el histórico no se reescribe).
//
// Haiku 4.5, sin thinking: las cuentas las hacen las herramientas, no el modelo
// (lib/asistente/herramientas). Pensar solo añadiría latencia, coste y bloques
// que habría que reenviar.

export const MODELO_ASISTENTE = 'claude-haiku-4-5';

/** Dólares por millón de tokens (Haiku 4.5). Escribir en caché: 1,25× con TTL de 5 minutos, 2× con TTL de una hora. */
export const PRECIOS_HAIKU_45 = {
  entrada: 1,
  salida: 5,
  escrituraCache: 1.25,
  escrituraCache1h: 2,
  lecturaCache: 0.1,
} as const;

export const TEMPERATURA = 0.2;
/**
 * Tope de salida por petición. Una respuesta buena es de ≤ 80 palabras (~150
 * tokens) y una petición de herramientas, ~60: 600 deja margen de sobra para
 * terminar la frase y corta antes a un modelo que se enrolla (el peor caso de
 * salida de una pregunta pasa de 6 × 1.024 a 6 × 600 tokens).
 */
export const MAX_TOKENS_RESPUESTA = 600;
