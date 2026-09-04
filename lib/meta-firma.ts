// Validación de la firma de webhooks entrantes de Meta (`X-Hub-Signature-256`).
// Algoritmo documentado por Meta: HMAC-SHA256 con el App Secret como clave,
// sobre el CUERPO CRUDO de la petición (antes de parsear JSON) — el header
// lleva el prefijo `sha256=` delante del hexdigest.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
//
// Mismo criterio que lib/twilio-firma.ts: sin SDK de Meta por un cálculo de
// HMAC de pocas líneas, y comparación en tiempo constante (timingSafeEqual)
// para no filtrar la firma esperada por temporización.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmaMetaValida(
  appSecret: string,
  cuerpoCrudo: string,
  firmaRecibida: string | null,
): boolean {
  if (!firmaRecibida) return false;
  const prefijo = 'sha256=';
  if (!firmaRecibida.startsWith(prefijo)) return false;
  const esperada = createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(firmaRecibida.slice(prefijo.length));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
