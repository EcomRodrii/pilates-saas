// Reintento de envíos Resend ante errores TRANSITORIOS — hueco real
// encontrado en producción (automation_logs): un 429 de "10 req/s" se
// registraba como FALLIDO para siempre, exactamente igual que un email con
// dominio inválido. Con una tanda de varias socias en la misma regla, una
// socia real por detrás de un puñado de envíos podía caer justo en el límite
// de tasa — y su recordatorio se perdía aunque reintentarlo un segundo
// después habría funcionado.
//
// Clasificación por el CÓDIGO tipado de Resend (`error.name`), no por texto
// del mensaje — los mensajes cambian de redacción, los códigos no.
// `rate_limit_exceeded` es el caso que lo motivó; `internal_server_error` y
// `application_error` son fallos del lado de Resend, igual de transitorios.
// Todo lo demás (dominio inválido, adjunto mal formado, clave de API
// incorrecta...) es un fallo PERMANENTE: reintentar no cambia el resultado,
// solo retrasa el log y gasta cupo de envíos en vano.

const CODIGOS_TRANSITORIOS = new Set([
  'rate_limit_exceeded',
  'internal_server_error',
  'application_error',
]);

export function esErrorTransitorioResend(nombreError: string | null | undefined): boolean {
  return !!nombreError && CODIGOS_TRANSITORIOS.has(nombreError);
}

export interface ResendEnvioResultado {
  data: unknown;
  error: { name: string; message: string } | null;
}

/**
 * Reintenta una llamada a Resend si el error es transitorio. Por defecto,
 * hasta 2 intentos en total con ~1.1s de espera entre ellos — Resend limita a
 * 10 req/s, así que algo más de 1s garantiza caer en una ventana nueva.
 * Un error permanente (o agotar los intentos) devuelve el último resultado tal
 * cual, sin lanzar — el llamador decide cómo registrar el fallo.
 */
export async function conReintentoResend<T extends ResendEnvioResultado>(
  enviar: () => Promise<T>,
  intentos = 2,
  esperaMs = 1100,
): Promise<T> {
  let resultado = await enviar();
  for (let hecho = 1; resultado.error && esErrorTransitorioResend(resultado.error.name) && hecho < intentos; hecho++) {
    await new Promise((r) => setTimeout(r, esperaMs));
    resultado = await enviar();
  }
  return resultado;
}
