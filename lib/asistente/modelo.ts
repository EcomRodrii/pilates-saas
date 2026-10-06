// El modelo del asistente y sus precios. Una sola constante: si algún día
// cambia, cambia aquí y en ningún otro sitio (el libro guarda el modelo de cada
// consulta, así que el histórico no se reescribe).
//
// Haiku 4.5, sin thinking: las cuentas las hacen las herramientas, no el modelo
// (lib/asistente/herramientas). Pensar solo añadiría latencia, coste y bloques
// que habría que reenviar.

export const MODELO_ASISTENTE = 'claude-haiku-4-5';

/** Dólares por millón de tokens (Haiku 4.5). La escritura de caché es la de 5 minutos. */
export const PRECIOS_HAIKU_45 = {
  entrada: 1,
  salida: 5,
  escrituraCache: 1.25,
  lecturaCache: 0.1,
} as const;

export const TEMPERATURA = 0.2;
export const MAX_TOKENS_RESPUESTA = 1024;
