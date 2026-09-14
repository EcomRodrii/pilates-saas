// Tokens de acceso en reposo: la BD guarda solo su SHA-256 (hex), nunca el
// token. Lo usan el token de dispositivo del kiosko (`kiosko_tokens`) y el
// enlace de «aceptar sustitución» (`sustitucion_contactos.token_hash`).
//
// Por qué SHA-256 a secas y no HMAC con un secreto de servidor: los dos tokens
// son de alta entropía (24 bytes aleatorios; un HMAC firmado), así que no hay
// diccionario ni fuerza bruta que un pepper frene — el pepper solo protege
// secretos adivinables (contraseñas, PIN). Y sin secreto, la migración puede
// hashear los tokens que ya existen en SQL (`extensions.digest(..., 'sha256')`)
// sin meter ninguna clave en un repositorio público. Mismo criterio que los
// tokens de OAuth (`lib/oauth-crypto.ts`), de donde salen las dos primitivas.
//
// ⚠️ La paridad con SQL la fija un test: `hashToken('abc')` tiene que dar lo
// mismo que `encode(extensions.digest('abc','sha256'),'hex')` en producción.

import { sha256Hex, compararEnTiempoConstante } from './oauth-crypto.ts';

export function hashToken(token: string): string {
  return sha256Hex(token);
}

// Sin token o sin hash guardado → false (el lado seguro: un kiosko sin
// configurar no ficha). La comparación es de hashes en tiempo constante.
export function tokenCoincideConHash(
  token: string | null | undefined,
  hashGuardado: string | null | undefined,
): boolean {
  if (!token || !hashGuardado) return false;
  return compararEnTiempoConstante(sha256Hex(token), hashGuardado);
}
