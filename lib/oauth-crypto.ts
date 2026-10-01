import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// Primitivas puras del servidor OAuth — sin Supabase, testables con
// `node --test` de forma aislada (mismo motivo que lib/marketing/pkce.ts:
// el resto del módulo arrastra lib/db/supabase-data-admin.ts, que node --test
// no resuelve sin pasar por el bundler de Next).

// Authorization codes y tokens: alta entropía, base64url (URL-safe, sin
// padding) — igual criterio que lib/marketing/pkce.ts.
export function generarTokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// Nunca se guarda un secret/código/token en claro en BD — solo su hash. Un
// volcado de la tabla (backup, fuga, consulta de un compañero) no debe poder
// autenticar nada.
export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

// Comparación en tiempo constante — mismo patrón que lib/oauth-state.ts.
// Longitudes distintas son ya una respuesta (no constante), pero eso solo
// filtra la LONGITUD del hash esperado, que es pública (siempre 64 hex de
// sha256) — no compromete nada.
export function compararEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// PKCE (RFC 7636), S256 únicamente (plain no se admite — Zapier y el resto
// de clientes serios lo soportan, y aceptar 'plain' sería aceptar un PKCE
// que no protege nada si el code se filtra por logs/referrer).
export function verificarPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const challengeCalculado = createHash('sha256').update(codeVerifier).digest('base64url');
  return compararEnTiempoConstante(challengeCalculado, codeChallenge);
}

// El catálogo de scopes vive en lib/api-publica/catalogo-scopes.ts (sin
// `crypto`, para que lo pueda importar el panel); aquí se reexporta para no
// cambiar a quien ya lo importaba de este módulo.
export { SCOPES_VALIDOS, scopesValidos, DESCRIPCION_SCOPE, type ScopeOAuth } from './api-publica/catalogo-scopes.ts';
