// ─────────────────────────────────────────────────────────────────────────────
// La clave de idempotencia de un cobro NUEVO del mismo intento, cuando el cobro
// de su clave ya no sirve (caducó, se canceló). La usan la sesión de Checkout de
// un recibo (`claveTrasSesion`) y el PaymentIntent de la Tienda (`claveTrasCobro`).
//
// Antes era `${clave}:tras-${idMuerto}`, y cada vuelta añadía el id entero (~72
// caracteres con un `cs_`): con un recibo de id largo, a la tercera repetición
// caducada seguida la clave pasaba de los 255 que admite Stripe, Stripe rechazaba
// la petición y la alumna se quedaba sin poder pagar ese intento.
//
// Ahora la parte que cambia es una huella CORTA y ESTABLE de toda la cadena (la
// clave de la que sale + el cobro muerto): la misma clave y el mismo cobro dan
// siempre la misma derivada (dos pestañas del mismo intento siguen compartiendo
// clave), una derivada distinta en cada vuelta (cada cobro muerto da otra), y la
// longitud ya no crece: raíz + 22 caracteres, vuelta tras vuelta.
//
// Puro y sin dependencias (ni `node:crypto`): lo carga `node --test` y no ata a
// ningún entorno.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo más largo que Stripe acepta en una Idempotency-Key. */
export const LONGITUD_MAXIMA_CLAVE_STRIPE = 255;

const SEPARADOR = ':tras-';

/** FNV-1a de 64 bits (dos mitades de 32), en 16 caracteres hexadecimales. */
function huella(texto: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 + 0x2c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * La clave del cobro siguiente del mismo intento. `clave` puede ser ya una derivada:
 * se conserva su raíz (lo que identifica el intento, legible en Stripe) y la huella
 * resume toda la cadena, así que la longitud no crece con las vueltas.
 */
export function claveTras(clave: string, muerto: string): string {
  const i = clave.indexOf(SEPARADOR);
  const raiz = i >= 0 ? clave.slice(0, i) : clave;
  const derivada = `${raiz}${SEPARADOR}${huella(`${clave}|${muerto}`)}`;
  if (derivada.length <= LONGITUD_MAXIMA_CLAVE_STRIPE) return derivada;
  // Una raíz tan larga no la genera hoy nadie; aun así, nunca por encima del límite.
  const sitio = LONGITUD_MAXIMA_CLAVE_STRIPE - SEPARADOR.length - 16 - 17;
  return `${raiz.slice(0, sitio)}~${huella(raiz)}${SEPARADOR}${huella(`${clave}|${muerto}`)}`;
}
