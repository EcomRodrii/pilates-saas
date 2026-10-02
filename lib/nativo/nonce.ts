// El nonce de «Iniciar sesión con Apple».
//
// Sirve para que un token de Apple robado no se pueda reutilizar: la app
// inventa un valor aleatorio por intento, Apple lo mete firmado en el token y
// el servidor comprueba que coincide.
//
// ⚠️ Viajan DOS valores distintos, y confundirlos hace fallar el login sin
// pista:
//   - A Apple (al plugin nativo) va el HASH: SHA-256 en hexadecimal del nonce.
//     El plugin lo pasa tal cual a `ASAuthorizationAppleIDRequest.nonce`, y eso
//     es lo que Apple escribe en el claim `nonce` del token.
//   - A Supabase va el nonce EN CRUDO:
//     `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`.
//     Supabase le hace él mismo el SHA-256 y lo compara con el claim.
// Si se manda el hash a Supabase, lo vuelve a hashear y no coincide nunca.

type FuenteAleatoria = Pick<Crypto, 'getRandomValues'>;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Nonce aleatorio en hexadecimal (32 bytes = 64 caracteres por defecto). */
export function generarNonce(bytes = 32, fuente: FuenteAleatoria = globalThis.crypto): string {
  if (!Number.isInteger(bytes) || bytes < 16) throw new Error('Un nonce necesita al menos 16 bytes');
  return hex(fuente.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256 de un texto UTF-8, en hexadecimal en minúsculas. */
export async function sha256Hex(texto: string, sutil: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const resumen = await sutil.digest('SHA-256', new TextEncoder().encode(texto));
  return hex(new Uint8Array(resumen));
}

/** El par que necesita un intento de login con Apple: `hash` para Apple, `crudo` para Supabase. */
export async function prepararNonceApple(): Promise<{ crudo: string; hash: string }> {
  const crudo = generarNonce();
  return { crudo, hash: await sha256Hex(crudo) };
}
