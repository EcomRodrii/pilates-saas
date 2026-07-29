import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

// Aviso por correo a soporte@tentare.app cuando, en el wizard de bienvenida
// tras crear un estudio (components/onboarding/pantalla-bienvenida.tsx), la
// propietaria pide ayuda humana ("Quiero una videollamada" / "Configuradlo
// por mí"). Antes de esto la respuesta se guardaba SOLO en
// studios.onb_ayuda_alta y nadie del equipo la leía: la propietaria creía que
// alguien la iba a llamar y no llegaba a pasar (detectado en pruebas de
// usuario con la persona "Carmen").
const AYUDAS_QUE_AVISAN = new Set(['Quiero una videollamada', 'Configuradlo por mí']);

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'onboarding-ayuda-alta', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ayuda?: string; software?: string | null } | null;
  const ayuda = typeof body?.ayuda === 'string' ? body.ayuda : '';
  if (!AYUDAS_QUE_AVISAN.has(ayuda)) return NextResponse.json({ ok: true, skipped: true });

  const admin = getSupabaseAdmin();
  const nombreEstudio = admin
    ? (await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle()).data?.nombre ?? sesion.nombre
    : sesion.nombre;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, skipped: true });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      ...(sesion.email ? { replyTo: sesion.email } : {}),
      subject: `[Puesta en marcha] ${esc(nombreEstudio)} pide "${esc(ayuda)}"`,
      html:
        `<p><strong>${esc(nombreEstudio)}</strong> acaba de crear su estudio y en el wizard de bienvenida ha pedido: <strong>${esc(ayuda)}</strong>.</p>` +
        (body?.software ? `<p>Viene de: ${esc(body.software)}</p>` : '') +
        `<p>Contacto: ${sesion.email ? esc(sesion.email) : '<em>no disponible</em>'}</p>`,
    });
    if (error) {
      console.error('[onboarding/ayuda-alta]', error);
      return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
    }
  } catch (err) {
    console.error('[onboarding/ayuda-alta]', err);
    return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
