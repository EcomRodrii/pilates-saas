// El QR de acceso de la alumna: qué lleva dentro y cómo se reconoce.
//
// Lleva SOLO un token opaco: `TNT1-` y 22 caracteres (128 bits). Ni nombre, ni
// email, ni id de socia, ni reservas. El token no sirve para nada por sí solo:
// lo lee alguien del equipo con su sesión, en su estudio, y Tentare decide en ese
// momento si puede entrar (lib/acceso/evaluar-acceso.ts). Un QR permanente no es
// un acceso permanente.
//
// Por qué se DERIVA y no se guarda: la alumna tiene que ver el mismo QR en el
// móvil nuevo o en el del estudio, y guardar el valor sería guardar una llave.
// Se guarda el id de la fila y el hash del token (`socios_qr_acceso`); el token
// sale de HMAC(secreto, id) cada vez que se pide. Con la base de datos entera y
// sin el secreto no se puede fabricar ningún QR.
//
// Mismo secreto que los enlaces de instructora (y que el pase de 2 minutos al que
// sustituyó, retirado el 28-sep), con un ámbito propio para que un token de un
// sitio no valga en otro. Si el secreto cambiara, el hash guardado dejaría de
// coincidir y, en producción, la fila se renueva sola al pedir el QR
// (qr-alumna-servidor.ts).
//
// Import relativo con extensión `.ts` y sin `@/`: lo prueba `node --test`.

import { createHash, createHmac, randomUUID } from 'crypto';
import { PREFIJO_QR } from './qr-formato.ts';

export { PREFIJO_QR, leerTokenQr } from './qr-formato.ts';

function secreto(): string {
  const s = process.env.SUSTITUCION_TOKEN_SECRET || process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error('Falta SUSTITUCION_TOKEN_SECRET (u OAUTH_STATE_SECRET) para el QR de acceso');
  return s;
}

/** Id de una fila nueva de `socios_qr_acceso`. Aleatorio: de él sale el token. */
export function nuevoIdQr(): string {
  return `qra-${randomUUID()}`;
}

/** El token que se pinta en el QR para esa fila. Siempre el mismo para el mismo id. */
export function tokenQrDeFila(filaId: string): string {
  const cuerpo = createHmac('sha256', secreto()).update(`qr-acceso:${filaId}`).digest().subarray(0, 16).toString('base64url');
  return `${PREFIJO_QR}${cuerpo}`;
}

/** Lo que se guarda y por lo que se busca al escanear. */
export function hashTokenQr(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
