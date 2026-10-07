// Firma de los webhooks de Wellhub (Booking API y Access Control).
//
// Cada webhook trae `X-Gympass-Signature` = HMAC-SHA1 del cuerpo con el secreto
// que damos al registrar el webhook (`WELLHUB_WEBHOOK_SECRET`), en hexadecimal
// (developers.wellhub.com: Booking API › Webhooks; Access Control › Check-in webhook).
//
// Su documentación se contradice en la forma, así que se acepta lo que diga
// cualquiera de sus versiones y nada más:
//  · el ejemplo de la cabecera lleva «0X» delante, y ninguno de sus ejemplos de
//    código lo genera → con o sin «0X»;
//  · dice que va siempre en mayúsculas, y su ejemplo en Go la saca en minúsculas
//    → sin distinguir mayúsculas.
// Qué se firma: el cuerpo tal cual llega. Su ejemplo en JavaScript firma
// `JSON.stringify(body)`, que es lo mismo si lo mandan compacto; por si firmaran
// otra serialización, se prueba también la del objeto parseado. Las dos son un
// HMAC con nuestro secreto: sin él no se puede fabricar ninguna.
//
// ⚠️ Sin secreto no se acepta nada: un endpoint que reserva plazas no puede
// quedar abierto porque falte una variable de entorno.
//
// Sin `server-only`: lo importan solo rutas de servidor y así corre con `node --test`.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmarWellhub(secreto: string, cuerpo: string): string {
  return createHmac('sha1', secreto).update(cuerpo, 'utf8').digest('hex').toUpperCase();
}

/** La cabecera tal como la documentan: 40 hexadecimales, con o sin «0X», en cualquier caja. */
function leerCabecera(cabecera: string): string | null {
  const limpia = cabecera.trim().replace(/^0x/i, '');
  return /^[0-9a-f]{40}$/i.test(limpia) ? limpia.toUpperCase() : null;
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Qué variante de la firma casó: el cuerpo crudo o el objeto reserializado.
 * Se apunta en Sentry para quitar la que no use Wellhub cuando se vea en el
 * sandbox. `null` = no casa con ninguna (o no hay secreto).
 *
 * Admite varios secretos (el actual y el anterior) para poder rotarlo sin
 * cortar: su doc del check-in dice además que ese secreto lo da Wellhub.
 */
export function verificarFirmaWellhub(
  secretos: readonly (string | null | undefined)[], cabecera: string | null, cuerpoCrudo: string,
): 'crudo' | 'reserializado' | null {
  const validos = secretos.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (validos.length === 0 || !cabecera) return null;
  const recibida = leerCabecera(cabecera);
  if (!recibida) return null;
  for (const secreto of validos) {
    if (iguales(firmarWellhub(secreto, cuerpoCrudo), recibida)) return 'crudo';
  }
  let otra: string;
  try {
    otra = JSON.stringify(JSON.parse(cuerpoCrudo));
  } catch {
    return null;
  }
  if (otra === cuerpoCrudo) return null;
  for (const secreto of validos) {
    if (iguales(firmarWellhub(secreto, otra), recibida)) return 'reserializado';
  }
  return null;
}
