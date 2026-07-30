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
