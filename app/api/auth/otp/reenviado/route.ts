import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Se llama justo después de un reenvío que YA tuvo éxito en gotrue
// (`reenviarConfirmacion`, protegido por captcha — este endpoint no repite
// esa llamada, solo limpia el cerrojo). Con un código nuevo enviado, el
// bloqueo de intentos del código ANTERIOR (/api/auth/otp/verificar) ya no
// tiene sentido — mantenerlo dejaría a alguien con un código recién llegado
// que no puede usar hasta que expire un bloqueo de hasta 15 min, una
// confusión peor que el riesgo que evita: reenviar YA es escaso por su
// cuenta (gotrue: máx. 2 emails/hora, 60s entre reenvíos, con captcha), así
// que dejar que también reinicie el contador de intentos no abre una vía de
// fuerza bruta nueva.
//
// Borra la fila directamente (service role, misma tabla que ya usa I14) en
// vez de reutilizar `rate_limit_hit` — esa RPC solo sabe incrementar, no
// resetear a cero.
export async function POST(req: NextRequest) {
  const porIp = await enforceRateLimit(req, 'otp-reset-intentos', { max: 10, windowSeconds: 300 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Falta el email.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (admin) await admin.from('rate_limits').delete().eq('bucket_key', `otp-verify-email:${email}`);
  // Fail-open a propósito, igual que el resto del limitador (I14): si esto
  // falla, en el peor caso el bloqueo viejo sigue en pie unos minutos más —
  // nunca debe romper el reenvío, que ya tuvo éxito antes de llegar aquí.
  return NextResponse.json({ ok: true });
}
