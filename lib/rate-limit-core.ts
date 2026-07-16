// I14 · Parte PURA del rate limiting (sin dependencias de BD ni de alias @/, para
// ser testeable por el runner de Node). Solo usa Web APIs (Request/Response), que
// también existen en el runtime de las rutas.

export interface RateLimitOptions {
  /** Máximo de peticiones permitidas dentro de la ventana. */
  max: number;
  /** Tamaño de la ventana en segundos. */
  windowSeconds: number;
}

// Deriva la IP del cliente de las cabeceras de proxy (Vercel pone la IP real en
// x-forwarded-for). Se toma la PRIMERA de la lista (el cliente original). Si no
// hay ninguna, cae a 'unknown' → todas esas peticiones comparten cubo (más
// estricto, nunca menos), que es el lado seguro.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
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
