import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Aviso por correo a soporte@tentare.app cuando alguien del equipo de un estudio
// escribe desde el widget de ayuda del panel (Duda / Mejora / Problema). El
// mensaje ya se guarda en la tabla `soporte_solicitudes` desde el cliente; esto
// es lo que hace que a nosotros NOS LLEGUE (antes solo quedaba en la base de
// datos y nadie lo veía). Se degrada sin romper si Resend no está configurado.
//
// Aquí había además un aviso por WhatsApp al número personal del fundador, por
// Twilio. Se retiró el 2026-09-09 con el resto de Twilio y, a diferencia de los
// otros seis emisores, NO se ha migrado a la Meta Cloud API: esa integración es
// de cada estudio y sirve para que un estudio hable con SUS clientas. Esto va en
// la dirección contraria —un estudio escribiendo a Tentare— así que no hay
// ninguna cuenta de WhatsApp que sea la correcta para mandarlo.
//
// ⚠️ Exige sesión de personal. Antes era un relay abierto: sin sesión, cualquiera
// podía meter correo en el buzón de soporte con el `replyTo` y el nombre de
// estudio que quisiera. Ahora quién escribe, desde qué estudio y a dónde se
// contesta salen de la SESIÓN, nunca del body.

const TIPOS: Record<string, string> = { DUDA: 'Duda', MEJORA: 'Mejora', BUG: 'Problema' };

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'soporte', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // Por persona además de por IP: una cuenta no puede llenar el buzón.
  const limitedUsuario = await enforceRateLimit(req, 'soporte-usuario', { max: 5, windowSeconds: 600 }, staff.userId);
  if (limitedUsuario) return limitedUsuario;

  const body = (await req.json().catch(() => null)) as
    | { tipo?: string; mensaje?: string; contacto?: string | null }
    | null;

  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
  if (!mensaje || mensaje.length > 4000) {
    return NextResponse.json({ error: 'Mensaje no válido' }, { status: 400 });
  }
  const tipo = TIPOS[body?.tipo ?? ''] ?? 'Mensaje';
  // Un teléfono u otro medio que la persona quiera añadir. Es solo texto dentro
  // del correo: la respuesta va siempre a la cuenta con la que ha entrado.
  const contactoExtra = typeof body?.contacto === 'string' ? body.contacto.trim().slice(0, 200) : '';

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, skipped: true });

  const admin = getSupabaseAdmin();
  const { data: studioRow } = admin
    ? await admin.from('studios').select('nombre').eq('id', staff.studioId).maybeSingle()
    : { data: null };
  const estudio = ((studioRow?.nombre as string | null | undefined) ?? '').trim().slice(0, 120) || staff.studioId;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      ...(staff.email ? { replyTo: staff.email } : {}),
      subject: `[${tipo}] Soporte Tentare · ${estudio}`,
      html:
        `<p><strong>${esc(tipo)}</strong> desde <strong>${esc(estudio)}</strong> (${esc(staff.studioId)})</p>` +
        `<p style="white-space:pre-wrap">${esc(mensaje)}</p>` +
        `<p>Cuenta: ${staff.email ? esc(staff.email) : '<em>sin email</em>'} · ${esc(staff.rol)}</p>` +
        (contactoExtra ? `<p>Otro contacto indicado: ${esc(contactoExtra)}</p>` : ''),
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
