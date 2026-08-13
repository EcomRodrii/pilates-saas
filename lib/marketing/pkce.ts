import { randomBytes, createHash } from 'crypto';

// PKCE (RFC 7636) — extraído a su propio módulo sin más dependencias que
// `crypto` para que sea testable con `node --test` de forma aislada:
// lib/klaviyo.ts arrastra lib/db/supabase-data-admin.ts (un fichero enorme
// de imports `@/lib/...` de valor, que node --test no resuelve sin pasar
// por el bundler de Next — ver docs/marketing-integrations-arquitectura.md).
// Klaviyo lo exige desde 2025 (bloquea el flujo OAuth sin él).
export function generarPkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(64).toString('base64url').slice(0, 128);
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
