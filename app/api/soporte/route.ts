import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';

// Aviso por correo a soporte@tentare.app cuando una propietaria escribe desde el
// widget de ayuda del panel (Duda / Mejora / Problema). El mensaje ya se guarda
// en la tabla `soporte_solicitudes` desde el cliente; esto es lo que hace que a
// nosotros NOS LLEGUE (antes solo quedaba en la base de datos y nadie lo veía).
// Se degrada sin romper si Resend no está configurado — igual que /waitlist.

const TIPOS: Record<string, string> = { DUDA: 'Duda', MEJORA: 'Mejora', BUG: 'Problema' };

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'soporte', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { tipo?: string; mensaje?: string; contacto?: string | null; studioNombre?: string | null }
    | null;

  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
  if (!mensaje || mensaje.length > 4000) {
    return NextResponse.json({ error: 'Mensaje no válido' }, { status: 400 });
  }
  const tipo = TIPOS[body?.tipo ?? ''] ?? 'Mensaje';
  const contacto = typeof body?.contacto === 'string' ? body.contacto.trim().slice(0, 200) : '';
  const estudio = typeof body?.studioNombre === 'string' ? body.studioNombre.trim().slice(0, 120) : '';

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, skipped: true });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      ...(contacto ? { replyTo: contacto } : {}),
      subject: `[${tipo}] Soporte Tentare${estudio ? ` · ${estudio}` : ''}`,
      html:
        `<p><strong>${esc(tipo)}</strong>${estudio ? ` desde <strong>${esc(estudio)}</strong>` : ''}</p>` +
        `<p style="white-space:pre-wrap">${esc(mensaje)}</p>` +
        `<p>Contacto: ${contacto ? esc(contacto) : '<em>no facilitado</em>'}</p>`,
    });
    if (error) {
      console.error('[soporte]', error);
      return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
    }
  } catch (err) {
    console.error('[soporte]', err);
    return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
