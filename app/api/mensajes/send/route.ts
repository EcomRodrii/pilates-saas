import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { enviarMensajeTwilio, twilioConfigurado, type CanalMensaje } from '@/lib/twilio';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Envío de un mensaje WhatsApp/SMS por Twilio. Solo la propietaria (es el
// mismo alcance que la pantalla de Campañas: /marketing está fuera de la
// lista blanca de instructora/recepción/manager en permisos-reglas.ts) y
// solo a un teléfono que sea de verdad de una socia de ESTE estudio — antes
// `to` se tomaba tal cual del body, así que cualquier staff autenticado (el
// check server-side solo comprobaba sesión, no rol) podía mandar texto libre
// a cualquier número del mundo con la cuenta de Twilio de la plataforma, sin
// límite de envíos. 503 si Twilio no está configurado.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'mensajes-send', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede enviar campañas' }, { status: 403 });
  }
  // R7: WhatsApp/SMS es un canal premium (marketing). Lo transaccional va por email.
  const bloqueoMkt = await bloqueoPorFeature(sesion.studioId, 'marketing');
  if (bloqueoMkt) return bloqueoMkt;

  const body = (await req.json().catch(() => null)) as {
    canal?: unknown; to?: unknown; asunto?: unknown; contenido?: unknown;
  } | null;
  const canal = body?.canal === 'SMS' || body?.canal === 'WHATSAPP' ? (body.canal as CanalMensaje) : null;
  const to = typeof body?.to === 'string' ? body.to : '';
  const contenido = typeof body?.contenido === 'string' ? body.contenido : '';
  const asunto = typeof body?.asunto === 'string' ? body.asunto : '';
  if (!canal || !contenido || !to) return NextResponse.json({ error: 'Falta canal, destinatario o contenido' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { data: socio } = await admin.from('socios')
    .select('id').eq('studio_id', sesion.studioId).eq('telefono', to).maybeSingle();
  if (!socio) {
    return NextResponse.json({ error: 'El destinatario no es una socia de este estudio' }, { status: 403 });
  }

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
