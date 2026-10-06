// Los topes de UNA pregunta. Están juntos para que se vean de un vistazo: son
// la diferencia entre una consulta de 0,01 $ y una de 1 $.

/** Herramientas ejecutadas por pregunta (cada `tool_use` cuenta). Pasado esto, `tool_choice: none`. */
export const MAX_HERRAMIENTAS = 5;
/** Peticiones a Anthropic por pregunta. */
export const MAX_LLAMADAS = 6;
/** Si se pasa y aún pide herramientas, se para («demasiado amplia»). = 5 unidades. */
export const COSTE_MAX_PREGUNTA_USD = 0.15;
/** Con más contexto que esto (medido con el `usage` real), «empieza una conversación nueva». */
export const MAX_CONTEXTO_TOKENS = 40_000;
/** Lo que vuelve de una herramienta al modelo (~3K tokens). */
export const MAX_CHARS_RESULTADO = 9_000;
/** Filas de una lista hacia el modelo; el resto va como `total` + `truncado`. */
export const MAX_FILAS = 20;
/** Cada campo de texto que viene de los datos (nombre de clase, de sala, de plan…). */
export const MAX_CHARS_CAMPO = 60;
/** Tope de cada herramienta. */
export const TIMEOUT_HERRAMIENTA_MS = 8_000;
/** Longitud de la pregunta. */
export const MAX_CHARS_PREGUNTA = 500;
/**
 * Respuestas SIN herramientas de datos (la charla: un saludo, «¿cómo hago X?»,
 * un consejo) que no gastan consulta, por estudio y día de Madrid. Pasado esto,
 * la charla gasta como cualquier otra. La dueña de la regla es
 * `ia_cerrar_consulta` (migr 20261006014513); esto es su espejo, y coste.test.ts
 * cruza los dos números.
 */
export const MAX_CHARLAS_GRATIS_DIA = 50;
