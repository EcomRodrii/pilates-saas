// Firma de las peticiones de Instant Booking de Urban Sports Club.
//
// USC llama a nuestro endpoint de reserva de forma SÍNCRONA cuando una socia
// suya pulsa «Reservar» (docs.urbansportsclub.io/endpoint/bookings). Cada
// petición trae:
//   X-Timestamp → fecha RFC3339 de la petición
//   X-Signature → base64(HMAC-SHA256(clientSecret, firma))
// donde la cadena firmada es, separada por «\n»:
//   MÉTODO \n RUTA COMPLETA \n X-Timestamp \n CUERPO JSON
//
// ⚠️ La RUTA es todo lo que va tras el dominio, empezando por «/»: para
// nuestro endpoint es «/api/plataformas/usc/reservar», no «/reservar».
// Firmar solo el último tramo es el error que la propia documentación avisa.
//
// ⚠️ Se firma el CUERPO CRUDO, tal cual llega. Su ejemplo en Node usa
// `JSON.stringify(req.body)`, que solo coincide si USC manda JSON compacto
// y en ese mismo orden; con el crudo no hay que suponer nada.
//
// Comparación en tiempo constante, igual que lib/meta-firma.ts. La ventana del
// timestamp (±5 min) la recomiendan como opcional; aquí es obligatoria: sin
// ella, una petición capturada se podría repetir para crear reservas.
//
// Sin `server-only`: lo importan solo rutas de servidor y así corre con
// `node --test`.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Margen de reloj aceptado entre USC y nosotros. */
export const VENTANA_TIMESTAMP_MS = 5 * 60 * 1000;

export type MotivoFirmaInvalida =
  | 'sin-secreto'
  | 'faltan-cabeceras'
  | 'timestamp-invalido'
  | 'timestamp-fuera-de-ventana'
  | 'firma-no-coincide';

export type ResultadoFirma = { ok: true } | { ok: false; motivo: MotivoFirmaInvalida };

/** La cadena que firma USC. Exportada para los tests y para depurar con ellos. */
export function cadenaFirmadaUsc(metodo: string, ruta: string, timestamp: string, cuerpoCrudo: string): string {
  return `${metodo.toUpperCase()}\n${ruta}\n${timestamp}\n${cuerpoCrudo}`;
}

export function firmarUsc(secreto: string, metodo: string, ruta: string, timestamp: string, cuerpoCrudo: string): string {
  return createHmac('sha256', secreto)
    .update(cadenaFirmadaUsc(metodo, ruta, timestamp, cuerpoCrudo), 'utf8')
    .digest('base64');
}

export function verificarFirmaUsc(args: {
  secreto: string | null | undefined;
  metodo: string;
  ruta: string;
  timestamp: string | null;
  firma: string | null;
  cuerpoCrudo: string;
  ahora?: number;
}): ResultadoFirma {
  const { secreto, metodo, ruta, timestamp, firma, cuerpoCrudo } = args;
  // Sin secreto no se acepta nada: un endpoint que reserva plazas no puede
  // quedar abierto porque falte una variable de entorno.
  if (!secreto) return { ok: false, motivo: 'sin-secreto' };
  if (!timestamp || !firma) return { ok: false, motivo: 'faltan-cabeceras' };

  const momento = Date.parse(timestamp);
  if (Number.isNaN(momento)) return { ok: false, motivo: 'timestamp-invalido' };
  const ahora = args.ahora ?? Date.now();
  if (Math.abs(ahora - momento) > VENTANA_TIMESTAMP_MS) return { ok: false, motivo: 'timestamp-fuera-de-ventana' };

  const esperada = Buffer.from(firmarUsc(secreto, metodo, ruta, timestamp, cuerpoCrudo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: 'firma-no-coincide' };
  }
  return { ok: true };
}

/**
 * Webhooks de USC (estados de reserva): NO van firmados como el Instant
 * Booking. Al registrar el endpoint se les da un secreto compartido
 * (`USC_WEBHOOK_SECRET`, distinto del client secret) y cada webhook trae en la
 * cabecera `x-signature-256` el SHA-256 de ese secreto (docs: endpoint/webhooks).
 * Su documentación no dice si en hex o en base64: se aceptan las dos, siempre
 * comparando en tiempo constante.
 */
export function verificarSecretoWebhookUsc(secreto: string | null | undefined, cabecera: string | null): boolean {
  if (!secreto || !cabecera) return false;
  const hash = createHash('sha256').update(secreto, 'utf8').digest();
  const recibida = cabecera.trim();
  for (const esperada of [hash.toString('hex'), hash.toString('base64')]) {
    const a = Buffer.from(esperada);
    const b = Buffer.from(recibida.length === esperada.length && /^[0-9A-F]+$/.test(recibida) ? recibida.toLowerCase() : recibida);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
