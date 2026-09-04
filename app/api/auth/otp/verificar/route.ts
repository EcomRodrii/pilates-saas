import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const dynamic = 'force-dynamic';

// Verificación de OTP de signup — reemplaza el enlace de confirmación.
//
// Por qué pasa por un endpoint propio y no `supabase.auth.verifyOtp()`
// directo desde el cliente: gotrue no lleva la cuenta de intentos fallidos
// por email (solo limita `/auth/v1/verify` por IP, 30 cada 5 min — mismo
// límite que ya tenía el proyecto en `[auth.rate_limit] token_verifications`,
// ver supabase/config.toml). Un código de 6 dígitos sin límite de intentos
// POR EMAIL es fuerza-bruteable en ~10^5 intentos de media rotando IP. Esta
// ruta añade ESE segundo cerrojo (6 intentos / 15 min, por email, con la
// misma RPC atómica `rate_limit_hit` que ya usa el resto del proyecto — I14,
// lib/rate-limit.ts — no se crea tabla ni mecanismo nuevo) antes de reenviar
// la petición a gotrue.
//
// El cliente de aquí usa la clave ANON (no service-role): verifyOtp es un
// endpoint público de auth, pensado para llamarse sin sesión — no hace falta
// ni se debe elevar privilegios para esto.
//
// gotrue devuelve el MISMO error ("Email link is invalid or has expired",
// `otp_expired`) tanto si el código está mal escrito como si de verdad
// caducó — a propósito, para no dar a quien prueba una pista de "casi
// aciertas". No se fabrica aquí una distinción que gotrue niega
// deliberadamente por seguridad: un único mensaje honesto cubre ambos casos.
export async function POST(req: NextRequest) {
  const porIp = await enforceRateLimit(req, 'otp-verify', { max: 30, windowSeconds: 300 });
  if (porIp) return porIp;

  const body = await req.json().catch(() => null) as { email?: string; token?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const token = body?.token?.trim();
  if (!email || !token || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'Código inválido.', errorCode: 'INVALIDO' }, { status: 400 });
  }

  const porEmail = await rateLimit(`otp-verify-email:${email}`, { max: 6, windowSeconds: 900 });
  if (!porEmail.allowed) {
    const retryAfter = porEmail.resetAt ? Math.max(1, Math.ceil((porEmail.resetAt.getTime() - Date.now()) / 1000)) : 900;
    return NextResponse.json(
      { error: 'Demasiados intentos. Solicita un código nuevo en unos minutos.', errorCode: 'DEMASIADOS_INTENTOS' },
      { status: 429, headers: { 'retry-after': String(retryAfter) } },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Servicio no configurado.', errorCode: 'INVALIDO' }, { status: 503 });
  }
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data, error } = await auth.auth.verifyOtp({ email, token, type: 'signup' });
  if (error || !data.session) {
    return NextResponse.json(
      { error: 'El código no es correcto o ha caducado. Comprueba el código o solicita uno nuevo.', errorCode: 'INVALIDO' },
      { status: 400 },
    );
  }

  // Auditoría 22ª pasada (3-sep-2026), S-1: único sitio seguro para resetear
  // el cerrojo de intentos. Antes existía `/api/auth/otp/reenviado`, un
  // endpoint aparte que lo borraba con solo `{email}` en el cuerpo — sin
  // captcha ni prueba de que un reenvío hubiera pasado por ahí de verdad,
  // así que cualquiera podía vaciar el límite de 6 intentos/15min de
  // CUALQUIER email a voluntad. Aquí SÍ hay prueba real: `verifyOtp` ya
  // respondió con éxito dos líneas arriba. Best-effort (nunca debe tumbar un
  // login que ya tuvo éxito): si falla, el peor caso es que el cerrojo viejo
  // siga en pie unos minutos más para un email que ya no lo necesita.
  const admin = getSupabaseAdmin();
  if (admin) await admin.from('rate_limits').delete().eq('bucket_key', `otp-verify-email:${email}`);

  // Solo lo estrictamente necesario para que el navegador rehidrate la
  // sesión con `setSession()` — nunca se registra el token en logs (Next.js
  // no serializa el body de la petición por defecto, y aquí no se llama a
  // ningún `console.log`/Sentry con `token` ni con la sesión completa).
  return NextResponse.json({
    ok: true,
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
  });
}
