// Validación de la firma de webhooks entrantes de Twilio (`X-Twilio-Signature`).
// Algoritmo documentado por Twilio: HMAC-SHA1 con el Auth Token como clave,
// sobre la URL completa + cada par clave/valor del body (form-encoded),
// ordenado alfabéticamente por clave y concatenado sin separador.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
//
// Sin SDK de Twilio (mismo criterio que lib/twilio.ts: evitar el paquete
// pesado por un cálculo de HMAC de 10 líneas).
import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmaTwilioValida(
  authToken: string,
  url: string,
  params: Record<string, string>,
  firmaRecibida: string | null,
): boolean {
  if (!firmaRecibida) return false;
  const base = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const esperada = createHmac('sha1', authToken).update(base, 'utf8').digest('base64');
  const a = Buffer.from(esperada);
  const b = Buffer.from(firmaRecibida);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
