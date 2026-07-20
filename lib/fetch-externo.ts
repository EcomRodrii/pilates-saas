// Cliente HTTP para proveedores externos (Google Calendar, Twilio, Cloudflare
// Stream, R2…).
//
// Por qué existe: un `fetch` sin timeout no falla cuando el proveedor cae —
// falla cuando el proveedor DEGRADA. La conexión queda abierta y la función
// serverless se cuelga hasta `maxDuration`. En `/api/cron/recordatorios` eso son
// 300 s de cómputo consumidos, trabajo parcial y ningún progreso persistido; el
// reintento vuelve a empezar desde cero y se cuelga otra vez. Un proveedor lento
// sale más caro que uno caído.
//
// El patrón ya existía en `lib/analytics.ts` (`AbortSignal.timeout(2000)`) pero
// no estaba propagado: era 1 de ~10 llamadas externas. Aquí se centraliza para
// que la respuesta a "¿cuánto esperamos a un tercero?" viva en un solo sitio.

/** Timeout por defecto para APIs de terceros: suficiente para una API sana,
 *  muy por debajo del `maxDuration` de cualquiera de nuestras funciones. */
export const TIMEOUT_EXTERNO_MS = 10_000;

/** Timeout para transferencias de datos (subidas/descargas a R2), donde el
 *  tamaño del cuerpo domina sobre la latencia del proveedor. */
export const TIMEOUT_TRANSFERENCIA_MS = 60_000;

/**
 * `fetch` con timeout obligatorio. Respeta un `signal` explícito si quien llama
 * ya gestiona su propia cancelación.
 *
 * Ante expiración, `fetch` rechaza con un `TimeoutError` — el mismo camino de
 * error que un fallo de red, así que los `try/catch` existentes lo cubren sin
 * cambios.
 */
export function fetchExterno(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_EXTERNO_MS,
): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}
