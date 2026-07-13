import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enviarMensajeTwilio, twilioConfigurado, type CanalMensaje } from '@/lib/twilio';

// Envío de un mensaje WhatsApp/SMS por Twilio. Igual que /api/emails/send: solo
// staff autenticado (evita que un tercero use la cuenta Twilio del estudio para
// spam). 503 si Twilio no está configurado.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    canal?: unknown; to?: unknown; asunto?: unknown; contenido?: unknown;
  } | null;
  const canal = body?.canal === 'SMS' || body?.canal === 'WHATSAPP' ? (body.canal as CanalMensaje) : null;
  const to = typeof body?.to === 'string' ? body.to : '';
  const contenido = typeof body?.contenido === 'string' ? body.contenido : '';
  const asunto = typeof body?.asunto === 'string' ? body.asunto : '';
  if (!canal || !contenido) return NextResponse.json({ error: 'Falta canal o contenido' }, { status: 400 });

  if (!twilioConfigurado(canal)) {
    return NextResponse.json(
      { error: `Twilio no configurado para ${canal}. Añade TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y ${canal === 'WHATSAPP' ? 'TWILIO_WHATSAPP_FROM' : 'TWILIO_SMS_FROM'} en las variables de entorno.` },
      { status: 503 },
    );
  }

  // WhatsApp/SMS son texto plano: el asunto (si lo hay) encabeza el cuerpo.
  const cuerpo = asunto ? `${asunto}\n\n${contenido}` : contenido;
  const r = await enviarMensajeTwilio({ canal, to, cuerpo });
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'No se pudo enviar' }, { status: r.skipped ? 503 : 500 });
  return NextResponse.json({ id: r.id });
}
