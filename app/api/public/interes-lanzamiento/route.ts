import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarCaptcha } from '@/lib/auth/captcha-servidor';

// Captación de interesadas mientras Tentare no está lanzado. `/crear-estudio`
// antes daba de alta un estudio real al momento; con el software aún sin
// abrir al público, en su lugar deja el email aquí para avisar por email
// marketing en cuanto esté activo. Mismo patrón que migracion-concierge:
// reusa `plataforma_lead` (origen `ALTA`, ya contemplado en el CHECK de la
// migración 0136) en vez de crear una tabla nueva.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-interes-lanzamiento', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { email?: string; nombre?: string; estudio?: string; ciudad?: string; captchaToken?: string } | null;

  // ⚠️ Este endpoint NO pasa por gotrue, así que aquí no verifica nadie más:
  // o se llama al `siteverify` o el token del formulario es decoración. Es
  // exactamente lo que pasaba antes —el widget se pintaba y el token no se
  // mandaba ni se comprobaba—, o sea que frenaba a personas y a ningún bot.
  //
  // Va ANTES de tocar la BD, y después del rate limit: verificar cuesta un
  // viaje a Cloudflare y no tiene sentido pagarlo por una IP que ya está
  // pasada de vueltas.
  const captcha = await verificarCaptcha(
    typeof body?.captchaToken === 'string' ? body.captchaToken : undefined,
    { ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() },
  );
  if (captcha !== 'ok') {
    return NextResponse.json(
      { error: 'No hemos podido comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.' },
      { status: 400 },
    );
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
  const estudio = typeof body?.estudio === 'string' ? body.estudio.trim().slice(0, 120) : '';
  const ciudad = typeof body?.ciudad === 'string' ? body.ciudad.trim().slice(0, 120) : '';
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Upsert sobre el email: recargar el formulario no debe crear varios leads,
  // y `estado`/`notas` no se tocan si ya lo estaba trabajando alguien.
  const { error } = await db.from('plataforma_lead').upsert(
    {
      id: `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      email: email.toLowerCase(),
      nombre: nombre || null,
      estudio: estudio || null,
      ciudad: ciudad || null,
      origen: 'ALTA',
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: 'email', ignoreDuplicates: false },
  );
  if (error) {
    console.error('[public:interes-lanzamiento] no se ha podido guardar el lead', error);
    return NextResponse.json(
      { error: 'No se ha podido registrar tu email. Escríbenos a hola@tentare.app.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
