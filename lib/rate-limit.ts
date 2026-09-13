// I14 · Rate limiting de endpoints públicos, respaldado por Postgres (Supabase).
// El contador atómico vive en la RPC `rate_limit_hit` (migración 0031); aquí la
// invocamos con el service role y traducimos el resultado a una Response 429.
// La lógica pura (IP, clave, HMAC de la clave, Retry-After, Response) vive en
// rate-limit-core.ts.
//
// FAIL-OPEN por diseño: si el service role no está configurado o la RPC falla, se
// PERMITE la petición. Un limitador nunca debe tumbar la app; su ausencia degrada
// a "sin límite", igual que el resto de integraciones gated por env del proyecto.
//
// ⚠️ La clave que llega aquí (`ruta:ip`, `otp-verify-email:email`) NUNCA se
// guarda tal cual: `aplicarRateLimit` la convierte en `ruta:hmac`. Quien tenga
// que tocar una fila concreta de `rate_limits` (borrar el cerrojo de OTP) debe
// pasar por `claveRateLimit`, o no encontrará nada.

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  type RateLimitOptions, type RateLimitResult, aplicarRateLimit, claveOpaca, rateLimitKey,
  retryAfterSeconds, secretoRateLimit, tooManyRequestsResponse,
} from '@/lib/rate-limit-core';

export type { RateLimitOptions, RateLimitResult } from '@/lib/rate-limit-core';
export { clientIp, rateLimitKey } from '@/lib/rate-limit-core';

// Aplica el límite sobre una clave. Devuelve el veredicto; nunca lanza (fail-open).
export async function rateLimit(bucketKey: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const admin = getSupabaseAdmin();
  const rpc = admin
    ? async (p_key: string, p_max: number, p_window_seconds: number) =>
      await admin.rpc('rate_limit_hit', { p_key, p_max, p_window_seconds })
    : null;
  return aplicarRateLimit(rpc, secretoRateLimit(process.env), bucketKey, opts);
}

/** La clave tal como queda guardada en `rate_limits`, o null si no hay secreto. */
export async function claveRateLimit(bucketKey: string): Promise<string | null> {
  const secreto = secretoRateLimit(process.env);
  return secreto ? claveOpaca(bucketKey, secreto) : null;
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
