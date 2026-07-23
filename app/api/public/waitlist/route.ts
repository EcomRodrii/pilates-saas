import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';

// Endpoint PÚBLICO (sin login): captura de email en la landing mientras
// "Crear estudio" está bloqueado (pre-lanzamiento). No persiste nada — solo
// avisa a soporte@tentare.app por correo. Igual que el resto de envíos del
// proyecto, se degrada sin romper si Resend no está configurado.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-waitlist', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, skipped: true });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      replyTo: email,
      subject: 'Nueva persona en la lista de espera de Tentare',
      html: `<p>Alguien ha dejado su email en la landing para el lanzamiento:</p><p><strong>${email}</strong></p>`,
    });
    if (error) {
      console.error('[public:waitlist]', error);
      return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
    }
  } catch (err) {
    console.error('[public:waitlist]', err);
    return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
