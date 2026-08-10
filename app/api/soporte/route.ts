import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';
import { enviarMensajeTwilio } from '@/lib/twilio';

// Aviso por correo a soporte@tentare.app cuando una propietaria escribe desde el
// widget de ayuda del panel (Duda / Mejora / Problema). El mensaje ya se guarda
// en la tabla `soporte_solicitudes` desde el cliente; esto es lo que hace que a
// nosotros NOS LLEGUE (antes solo quedaba en la base de datos y nadie lo veía).
// Se degrada sin romper si Resend no está configurado — igual que /waitlist.
//
// Además, aviso por WhatsApp al número personal del fundador — mismo canal de
// plataforma (Twilio) que ya usan sustituciones/avisos, se degrada solo con
// `skipped:true` si TWILIO_* no está configurado (ver lib/twilio.ts), sin
// romper el flujo si falla. Best-effort: el email sigue siendo el registro
// de verdad, esto solo añade un canal más rápido de enterarse.
const SOPORTE_WHATSAPP = '+34640525871';

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

  // Best-effort, nunca bloquea ni condiciona la respuesta: si Twilio no está
  // configurado o el envío falla, el email de abajo sigue siendo el registro
  // de verdad.
  try {
    await enviarMensajeTwilio({
      canal: 'WHATSAPP',
      to: SOPORTE_WHATSAPP,
      cuerpo: `[${tipo}] Soporte Tentare${estudio ? ` · ${estudio}` : ''}\n\n${mensaje}\n\nContacto: ${contacto || 'no facilitado'}`,
    });
  } catch (err) {
    console.error('[soporte] aviso WhatsApp:', err);
  }

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
