// Reglas puras del puente de sesión del widget embebido
// (app/widget-auth-retorno). Sin dependencias de navegador ni de Supabase para
// poder probarlas con `node --test`.
//
// La garantía que sostienen: el puente solo reenvía al widget una sesión que
// nació de un acceso por email completado DESPUÉS de abrirse ese puente, y el
// widget solo acepta el mensaje del intento que él mismo inició. Una sesión que
// ya estuviera guardada en el navegador nunca sale por aquí.

/**
 * Métodos `amr` de gotrue que prueban posesión del email.
 *
 * - `otp`: lo que emite gotrue al verificar un enlace o código de email en flujo
 *   implícito (el de `supabasePortal`) — `verifyGet`/`verifyPost` llaman a
 *   `issueRefreshToken(..., models.OTP, ...)`.
 * - `magiclink` / `email/signup`: los que emitiría el flujo PKCE, que toma el
 *   método del `type` del enlace. Se aceptan para no romper si algún día se
 *   cambia de flujo; siguen siendo prueba de email.
 *
 * Contraseña, OAuth, refresco de token, anónima, etc. quedan fuera a propósito.
 */
const METODOS_EMAIL = new Set(['otp', 'magiclink', 'email/signup']);

/** Desfase de reloj tolerado entre quien abre el puente y gotrue. */
export const TOLERANCIA_PUENTE_MS = 30_000;

function decodificarPayloadJwt(token: string): unknown {
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  const b64url = partes[1];
  if (!/^[A-Za-z0-9_-]+$/.test(b64url)) return null;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  try {
    const binario = atob(b64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

/**
 * ¿Este access token viene de un acceso por email posterior a `desdeMs`?
 *
 * No verifica la firma (eso lo hace Supabase cuando el token se usa): solo
 * decide si el puente debe REENVIARLO. Falla cerrado ante cualquier cosa rara —
 * token malformado, `amr` ausente o en formato sin fecha, otro método.
 */
export function sesionAutenticadaPorEmailDespuesDe(
  accessToken: string,
  desdeMs: number,
  toleranciaMs: number = TOLERANCIA_PUENTE_MS,
): boolean {
  if (typeof accessToken !== 'string' || !Number.isFinite(desdeMs)) return false;
  const payload = decodificarPayloadJwt(accessToken);
  if (!payload || typeof payload !== 'object') return false;
  const amr = (payload as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return false;
  const limite = desdeMs - Math.max(0, toleranciaMs);
  return amr.some((entrada) => {
    if (!entrada || typeof entrada !== 'object') return false;
    const { method, timestamp } = entrada as { method?: unknown; timestamp?: unknown };
    return typeof method === 'string'
      && METODOS_EMAIL.has(method)
      && typeof timestamp === 'number'
      && Number.isFinite(timestamp)
      && timestamp * 1000 >= limite;
  });
}

/**
 * Identificador de un intento de acceso por enlace (lo genera el widget con
 * `crypto.randomUUID()`). Solo se valida la forma: no es un secreto, sirve para
 * que el widget descarte mensajes que no son de su intento en curso.
 */
export function nonceValido(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(nonce);
}
