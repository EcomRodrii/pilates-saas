// Cómo es un QR de acceso de Tentare por fuera: `TNT1-` y 22 caracteres. Sin
// criptografía, para que el lector del navegador lo reconozca sin mandar al
// servidor cualquier código de barras que vea. Quién es lo decide el servidor
// (lib/acceso/qr-token.ts). Puro: se prueba con `node --test`.

export const PREFIJO_QR = 'TNT1-';
const LARGO_CUERPO = 22; // 16 bytes en base64url, sin relleno
const FORMATO = /^TNT1-[A-Za-z0-9_-]{22}$/;

/**
 * Lo que devuelve la cámara, limpio, o `null` si no es un QR de acceso de
 * Tentare. Se acepta con espacios alrededor (algunos lectores añaden un salto de
 * línea) y nada más: ni minúsculas cambiadas ni prefijos distintos.
 */
export function leerTokenQr(lectura: string | null | undefined): string | null {
  if (typeof lectura !== 'string') return null;
  const limpio = lectura.trim();
  return limpio.length === PREFIJO_QR.length + LARGO_CUERPO && FORMATO.test(limpio) ? limpio : null;
}
