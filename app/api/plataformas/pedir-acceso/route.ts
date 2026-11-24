import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  CORREO_PETICIONES_PLATAFORMA, asuntoPeticion, plataformaDePeticion, textoPeticion,
} from '@/lib/plataformas/pedir-acceso';

// «Pedir acceso» a ClassPass o Wellhub (o a la beta de Urban Sports Club): un
// correo a soporte con el estudio y a dónde contestar (`lib/plataformas/pedir-acceso.ts`).
//
// Solo la PROPIETARIA, como el resto de Conexiones. Quién pide, de qué estudio y
// a dónde se contesta salen de la SESIÓN, nunca del body (mismo criterio que
// /api/soporte: antes era un relay abierto). Tres peticiones por estudio y
// plataforma al día: el botón no puede llenar el buzón.

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'plataformas-pedir-acceso-ip', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede pedir una conexión' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { plataforma?: unknown } | null;
  const plataforma = plataformaDePeticion(body?.plataforma);
  if (!plataforma) return NextResponse.json({ error: 'Plataforma no válida' }, { status: 400 });

  // Pocas por estudio y plataforma al día (clave del estudio, no de la IP): si el envío falla, puede reintentar.
  const repetida = await enforceRateLimit(
    req, `plataformas-pedir-acceso-${plataforma.toLowerCase()}`, { max: 3, windowSeconds: 86_400 }, sesion.studioId,
  );
  if (repetida) {
    return NextResponse.json({ error: 'Ya la has pedido hoy. Te avisaremos en cuanto sepamos algo.', yaPedida: true }, { status: 429 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, skipped: true });

  const admin = getSupabaseAdmin();
  const { data: fila } = admin
    ? await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle()
    : { data: null };
  const estudio = ((fila?.nombre as string | null | undefined) ?? '').trim().slice(0, 120) || sesion.studioId;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [CORREO_PETICIONES_PLATAFORMA],
      ...(sesion.email ? { replyTo: sesion.email } : {}),
      subject: asuntoPeticion(plataforma, estudio),
      html: `<p style="white-space:pre-wrap">${esc(textoPeticion(plataforma, { estudio, estudioId: sesion.studioId, correo: sesion.email ?? null }))}</p>`,
    });
    if (error) {
      console.error('[plataformas-pedir-acceso]', error);
      return NextResponse.json({ error: 'No se ha podido enviar. Inténtalo de nuevo en un rato.' }, { status: 502 });
    }
  } catch (err) {
    console.error('[plataformas-pedir-acceso]', err);
    return NextResponse.json({ error: 'No se ha podido enviar. Inténtalo de nuevo en un rato.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
