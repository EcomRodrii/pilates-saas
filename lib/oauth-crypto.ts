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

// Los 7 scopes de v1 (Fases 0-4: solo lectura + /me). `pagos:escribir`
// deliberadamente no existe — ver docs/oauth-arquitectura.md.
export const SCOPES_VALIDOS = [
  'clientas:leer',
  'clientas:escribir',
  'reservas:leer',
  'reservas:escribir',
  'pagos:leer',
  'instructores:leer',
  'notas:leer',
  'notas:escribir',
  'tareas:leer',
  'tareas:escribir',
  'leads:leer',
  'leads:escribir',
] as const;
export type ScopeOAuth = (typeof SCOPES_VALIDOS)[number];

export function scopesValidos(scopes: string[]): scopes is ScopeOAuth[] {
  return scopes.length > 0 && scopes.every(s => (SCOPES_VALIDOS as readonly string[]).includes(s));
}

// Descripción en español para la pantalla de consentimiento.
export const DESCRIPCION_SCOPE: Record<ScopeOAuth, string> = {
  'clientas:leer': 'Leer tus clientas',
  'clientas:escribir': 'Crear y editar clientas',
  'reservas:leer': 'Leer tus reservas',
  'reservas:escribir': 'Crear y cancelar reservas',
  'pagos:leer': 'Leer tus pagos y recibos',
  'instructores:leer': 'Leer tu equipo de instructoras',
  'notas:leer': 'Leer notas operativas',
  'notas:escribir': 'Crear notas operativas',
  'tareas:leer': 'Leer tareas',
  'tareas:escribir': 'Crear tareas',
  'leads:leer': 'Leer tus leads',
  'leads:escribir': 'Crear leads',
};
