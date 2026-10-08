import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/rate-limit-core';
import { captchaDeServidorListo, verificarCaptcha } from '@/lib/auth/captcha-servidor';
import { canjearCodigo } from '@/lib/regalo/servidor';
import { MENSAJE_MOTIVO_REGALO } from '@/lib/regalo/reglas';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// La alumna canjea el código: la tarjeta pasa a su ficha (no mueve dinero). Exige sesión real
// de socia (la identidad sale del JWT, nunca del body). Es la puerta por la que se podría
// intentar adivinar códigos, así que lleva límite por IP y por cuenta, y captcha en servidor.
// (80 bits de código hacen inviable adivinar; los límites cortan el resto: abuso y ruido.)
export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-regalo-canjear', { max: 10, windowSeconds: 60 })) ??
    (await enforceRateLimit(req, 'public-regalo-canjear-dia', { max: 60, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as { studioId?: unknown; codigo?: unknown; captchaToken?: unknown } | null;
  if (typeof body?.studioId !== 'string' || typeof body.codigo !== 'string' || body.codigo.length > 60) {
    return NextResponse.json({ error: 'Escribe el código de tu tarjeta.' }, { status: 400 });
  }
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Por CUENTA, no solo por IP: detrás de una wifi compartida la IP no distingue a nadie, y
  // quien cambia de IP no se libra de este tope.
  const porCuenta = await rateLimit(`public-regalo-canjear-cuenta:${user.userId}`, { max: 8, windowSeconds: 600 });
  if (!porCuenta.allowed) return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 });

  if (!captchaDeServidorListo()) return NextResponse.json({ error: 'El canje no está disponible ahora mismo.' }, { status: 503 });
  const captcha = await verificarCaptcha(typeof body.captchaToken === 'string' ? body.captchaToken : undefined, { ip: clientIp(req) });
  if (captcha !== 'ok') return NextResponse.json({ error: 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const r = await canjearCodigo(admin, body.studioId, socioId, body.codigo);
    if (!r.ok) {
      return NextResponse.json({ error: MENSAJE_MOTIVO_REGALO[r.motivo] ?? 'No hemos podido canjear la tarjeta.' }, { status: r.motivo === 'error' ? 500 : 400 });
    }
    return NextResponse.json({ ok: true, saldo: r.saldo, caducaEn: r.caducaEn });
  } catch (err) {
    return errorInterno('public/regalo/canjear:POST', err, 'No hemos podido canjear la tarjeta.');
  }
}
