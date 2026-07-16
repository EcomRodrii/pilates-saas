// I14 · Rate limiting de endpoints públicos, respaldado por Postgres (Supabase).
// El contador atómico vive en la RPC `rate_limit_hit` (migración 0031); aquí la
// invocamos con el service role y traducimos el resultado a una Response 429.
// La lógica pura (IP, clave, Retry-After, Response) vive en rate-limit-core.ts.
//
// FAIL-OPEN por diseño: si el service role no está configurado o la RPC falla, se
// PERMITE la petición. Un limitador nunca debe tumbar la app; su ausencia degrada
// a "sin límite", igual que el resto de integraciones gated por env del proyecto.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  type RateLimitOptions, rateLimitKey, retryAfterSeconds, tooManyRequestsResponse,
} from '@/lib/rate-limit-core';

export type { RateLimitOptions } from '@/lib/rate-limit-core';
export { clientIp, rateLimitKey } from '@/lib/rate-limit-core';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

// Aplica el límite sobre una clave. Devuelve el veredicto; nunca lanza (fail-open).
export async function rateLimit(bucketKey: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { allowed: true, remaining: opts.max, resetAt: null };
  try {
    const { data, error } = await admin.rpc('rate_limit_hit', {
      p_key: bucketKey, p_max: opts.max, p_window_seconds: opts.windowSeconds,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { allowed: true, remaining: opts.max, resetAt: null };
    const r = row as { allowed: boolean; remaining: number; reset_at: string };
    return { allowed: r.allowed, remaining: r.remaining, resetAt: new Date(r.reset_at) };
  } catch {
    return { allowed: true, remaining: opts.max, resetAt: null };
  }
}

// Helper para rutas: aplica el límite y, si se excede, devuelve una Response 429
// con Retry-After. Si se permite, devuelve null y la ruta continúa normalmente.
export async function enforceRateLimit(
  req: Request, name: string, opts: RateLimitOptions, extra?: string,
): Promise<Response | null> {
  const result = await rateLimit(rateLimitKey(name, req, extra), opts);
  if (result.allowed) return null;
  return tooManyRequestsResponse(retryAfterSeconds(result.resetAt, opts.windowSeconds));
}
