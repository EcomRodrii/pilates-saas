import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';

// Concierge de migración (landing): la propietaria deja su email y de qué
// software viene, y Tentare le hace la migración (48h). Mismo patrón que el
// waitlist: aviso a soporte@tentare.app vía Resend, degradación sin romper.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-migracion-concierge', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { email?: string; software?: string } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const software = typeof body?.software === 'string' ? body.software.trim().slice(0, 120) : '';
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
      subject: `Migración concierge solicitada${software ? ` — viene de ${software}` : ''}`,
      html:
        `<p>Una propietaria quiere que le hagamos la migración:</p>` +
        `<p><strong>${email}</strong>${software ? ` — software actual: <strong>${software.replace(/</g, '&lt;')}</strong>` : ''}</p>` +
        `<p>Siguiente paso: responderle pidiendo los exports (o acceso) y montarle el estudio con /migracion en menos de 48h.</p>`,
    });
    if (error) {
      console.error('[public:migracion-concierge]', error);
      return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
    }
  } catch (err) {
    console.error('[public:migracion-concierge]', err);
    return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
