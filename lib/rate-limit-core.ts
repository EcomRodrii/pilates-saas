// I14 · Parte PURA del rate limiting (sin dependencias de BD ni de alias @/, para
// ser testeable por el runner de Node). Solo usa Web APIs (Request/Response), que
// también existen en el runtime de las rutas.

export interface RateLimitOptions {
  /** Máximo de peticiones permitidas dentro de la ventana. */
  max: number;
  /** Tamaño de la ventana en segundos. */
  windowSeconds: number;
}

// Deriva la IP del cliente de las cabeceras de proxy. x-forwarded-for es una
// lista que cada proxy va AÑADIENDO por el final con la IP que él vio — el
// cliente puede escribir lo que quiera en la cabecera que él mismo envía, así
// que la ÚNICA entrada de la que Vercel responde es la ÚLTIMA (la que su
// propio borde añadió al recibir la conexión TCP real). Tomar la primera
// entrada (como hacía antes) deja que un atacante rote una IP falsa distinta
// en cada petición y vacíe el límite por completo. Si no hay ninguna, cae a
// 'unknown' → todas esas peticiones comparten cubo (más estricto, nunca
// menos), que es el lado seguro.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const partes = xff.split(',').map(p => p.trim()).filter(Boolean);
    const last = partes[partes.length - 1];
    if (last) return last;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}

// Clave de cubo: nombre-de-ruta + IP (+ clave extra opcional, p.ej. el slug del
// estudio para limitar por-estudio además de por-IP).
export function rateLimitKey(name: string, req: Request, extra?: string): string {
  return `${name}:${clientIp(req)}${extra ? `:${extra}` : ''}`;
}

// Segundos hasta el reinicio de la ventana (mínimo 1), a partir del instante de
// reinicio autoritativo; si no lo hay, cae al tamaño de ventana.
export function retryAfterSeconds(resetAt: Date | null, windowSeconds: number, now = Date.now()): number {
  if (!resetAt) return windowSeconds;
  return Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
}

// Construye la Response 429 con Retry-After.
export function tooManyRequestsResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.' }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(retryAfter) } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Claves OPACAS en `rate_limits`.
//
// La clave que componen las rutas lleva la IP (`ruta:1.2.3.4`) y, en el cerrojo
// de OTP, el email (`otp-verify-email:ana@x.es`). Guardada así, `rate_limits`
// era un registro de qué IP o qué email había tocado qué ruta, sin purga. Al
// limitador no le hace falta leer la IP: solo necesita que la MISMA entrada dé
// siempre la MISMA clave. Por eso se guarda `prefijo:` + HMAC-SHA256 truncado.
//
// HMAC con secreto y no un hash a secas: el espacio de IPv4 son 2^32 valores, y
// un SHA-256 sin clave se invierte probándolos todos en minutos. Sin el secreto
// no hay por dónde empezar.
//
// El prefijo (nombre de la ruta) se queda en claro a propósito: no es dato
// personal y es lo único que hace legible la tabla al depurar.
// ─────────────────────────────────────────────────────────────────────────────

/** Caracteres hex del HMAC que se guardan: 32 = 128 bits, colisión despreciable. */
export const LONGITUD_HMAC_CLAVE = 32;

/**
 * Secreto del HMAC. `RATE_LIMIT_HMAC_SECRET` si está puesta; si no, la clave
 * service-role de Supabase — solo-servidor, y SIEMPRE presente cuando el
 * limitador funciona (sin ella no hay cliente admin y `rateLimit` ya deja pasar).
 * Rotar cualquiera de las dos solo reinicia los contadores, que viven minutos.
 * Vacío = no hay secreto: el llamador NO debe escribir nada (ver aplicarRateLimit).
 */
export function secretoRateLimit(env: Record<string, string | undefined>): string {
  return env.RATE_LIMIT_HMAC_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
}

/**
 * `prefijo:hmac`. El prefijo es lo que va antes del primer `:` si parece un
 * nombre de ruta; si no (una clave sin `:` que fuera un email a pelo), se usa
 * `rl` para no dejar nunca en claro algo que no controlamos.
 * Web Crypto y no `node:crypto`: este módulo solo usa APIs web (ver cabecera).
 */
export async function claveOpaca(clave: string, secreto: string): Promise<string> {
  if (!secreto) throw new Error('claveOpaca: secreto vacío');
  const i = clave.indexOf(':');
  const candidato = i === -1 ? '' : clave.slice(0, i);
  const prefijo = /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(candidato) ? candidato : 'rl';
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(clave)));
  const hex = Array.from(firma, b => b.toString(16).padStart(2, '0')).join('');
  return `${prefijo}:${hex.slice(0, LONGITUD_HMAC_CLAVE)}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

/** Llamada a la RPC `rate_limit_hit`, inyectada para poder probarla sin BD. */
export type RpcRateLimit = (
  clave: string, max: number, windowSeconds: number,
) => Promise<{ data: unknown; error: unknown }>;

/**
 * Núcleo de `rateLimit` (lib/rate-limit.ts). FAIL-OPEN: sin RPC, sin secreto o
 * con error, deja pasar. Sin secreto NO se llama a la RPC — la alternativa sería
 * escribir la clave en claro, que es justo lo que esto evita.
 */
export async function aplicarRateLimit(
  rpc: RpcRateLimit | null, secreto: string, bucketKey: string, opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const abierto = { allowed: true, remaining: opts.max, resetAt: null };
  if (!rpc || !secreto) return abierto;
  try {
    const { data, error } = await rpc(await claveOpaca(bucketKey, secreto), opts.max, opts.windowSeconds);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return abierto;
    const r = row as { allowed: boolean; remaining: number; reset_at: string };
    return { allowed: r.allowed, remaining: r.remaining, resetAt: new Date(r.reset_at) };
  } catch {
    return abierto;
  }
}
