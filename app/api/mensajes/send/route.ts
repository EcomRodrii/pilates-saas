import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { enviarWhatsAppTexto } from '@/lib/whatsapp';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Envío de un mensaje suelto de WhatsApp desde Mensajería. Solo la propietaria
// (es el mismo alcance que la pantalla de Campañas: /marketing está fuera de la
// lista blanca de instructora/recepción/manager en permisos-reglas.ts) y solo a
// un teléfono que sea de verdad de una socia de ESTE estudio — antes `to` se
// tomaba tal cual del body, así que cualquier staff autenticado (el check
// server-side solo comprobaba sesión, no rol) podía mandar texto libre a
// cualquier número del mundo con la cuenta de Twilio de la plataforma, sin
// límite de envíos.
//
// Sale por la Meta Cloud API del PROPIO estudio, no por Twilio: en producción
// no existía ninguna variable TWILIO_*, así que esta ruta devolvía 503 sin
// intentar nada (ver WHATSAPP_AUDIT.md §0).
//
// ⚠️ Va como texto, sin plantilla, y eso NO es un descuido. El cuerpo lo
// escribe la propietaria en el momento: es distinto cada vez y casi siempre
// multilínea, y un parámetro de plantilla de Meta no admite saltos de línea, de
// modo que no hay ningún `{{1}}` donde quepa. Consecuencia real que hay que
// aceptar: solo llega a quien haya escrito al estudio en las últimas 24 h; al
// resto, Meta responde 131047 y ese error se devuelve tal cual a la pantalla en
// vez de fingir un envío.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'mensajes-send', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede enviar campañas' }, { status: 403 });
  }
  // R7: WhatsApp es un canal premium (marketing). Lo transaccional va por email.
  const bloqueoMkt = await bloqueoPorFeature(sesion.studioId, 'marketing');
  if (bloqueoMkt) return bloqueoMkt;

  const body = (await req.json().catch(() => null)) as {
    to?: unknown; asunto?: unknown; contenido?: unknown;
  } | null;
  const to = typeof body?.to === 'string' ? body.to : '';
  const contenido = typeof body?.contenido === 'string' ? body.contenido : '';
  const asunto = typeof body?.asunto === 'string' ? body.asunto : '';
  if (!contenido || !to) return NextResponse.json({ error: 'Falta destinatario o contenido' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { data: socio } = await admin.from('socios')
    .select('id').eq('studio_id', sesion.studioId).eq('telefono', to).maybeSingle();
  if (!socio) {
    return NextResponse.json({ error: 'El destinatario no es una socia de este estudio' }, { status: 403 });
  }

  // WhatsApp es de CADA estudio, no de la plataforma: el 503 tiene que decir
  // dónde se arregla, no solo que no se puede (mismo criterio y mismo texto que
  // /api/marketing/hueco/avisar).
  const whatsapp = whatsappDelEstudio(await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP'));
  if (!whatsapp) {
    return NextResponse.json(
      { error: 'Conecta tu WhatsApp Business en Configuración → Integraciones' },
      { status: 503 },
    );
  }

  // WhatsApp es texto plano: el asunto (si lo hay) encabeza el cuerpo.
  const cuerpo = asunto ? `${asunto}\n\n${contenido}` : contenido;
  const r = await enviarWhatsAppTexto(whatsapp, to, cuerpo);
  // Un solo envío, así que no hace falta acumulador: este resultado ES la
  // última conversación con Meta, y es justo lo que la tarjeta de Integraciones
  // necesita saber.
  await registrarSaludIntegracion(admin, sesion.studioId, 'WHATSAPP', r);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ id: r.id });
}
