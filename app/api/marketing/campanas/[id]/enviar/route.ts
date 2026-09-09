import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { mapCampana } from '@/lib/supabase-data';
import { whatsappDelEstudio } from '@/lib/whatsapp-estudio';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import type { RowCampanas } from '@/lib/db-types';
import * as Sentry from '@sentry/nextjs';

// POST /api/marketing/campanas/[id]/enviar — encola el envío real en
// servidor (lib/inngest/campanas.ts) y devuelve inmediato. El envío ya no se
// orquesta destinataria a destinataria desde el navegador — ver
// docs/marketing-integrations-arquitectura.md §5.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'campanas-enviar', { max: 5, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede enviar campañas' }, { status: 403 });
  }
  // R7: mismo gate que el resto de marketing (canal premium).
  const bloqueoMkt = await bloqueoPorFeature(sesion.studioId, 'marketing');
  if (bloqueoMkt) return bloqueoMkt;

  const { id: campanaId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: row, error } = await admin.from('campanas').select('*')
    .eq('id', campanaId).eq('studio_id', sesion.studioId).maybeSingle();
  if (error || !row) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });
  const campana = mapCampana(row as RowCampanas);

  if (campana.tipo === 'EMAIL' && (!campana.asunto?.trim() || !campana.contenido?.trim())) {
    return NextResponse.json({ error: 'La campaña no tiene asunto o contenido' }, { status: 400 });
  }

  // WhatsApp sale por la Meta Cloud API del PROPIO estudio (no por Twilio, que
  // se retiró: no existía en producción). Se comprueba AQUÍ, antes del
  // compare-and-set de abajo, y no dentro del worker: si se dejara pasar, la
  // campaña se quedaría en ENVIANDO —estado del que el propio CAS impide
  // salir— por no tener credenciales, y la propietaria no tendría forma de
  // recuperarla. Comprobando antes, sigue en BORRADOR: conecta WhatsApp y le da
  // otra vez a Enviar.
  if (campana.tipo === 'WHATSAPP' && !whatsappDelEstudio(await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP'))) {
    return NextResponse.json(
      { error: 'Conecta tu WhatsApp Business en Configuración → Integraciones' },
      { status: 503 },
    );
  }

  // Compare-and-set (mismo criterio que dbTransicionarRecomendacion en
  // app/api/decisiones/[id]/aprobar): solo pasa a ENVIANDO desde un estado
  // que de verdad significa "todavía no se ha enviado". Sin esto, un
  // doble-clic (o dos pestañas) podría encolar el mismo envío dos veces.
  const { data: actualizada, error: errorUpdate } = await admin.from('campanas')
    .update({ estado: 'ENVIANDO' })
    .eq('id', campanaId).eq('studio_id', sesion.studioId)
    .in('estado', ['BORRADOR', 'PROGRAMADA'])
    .select('id');
  if (errorUpdate) return NextResponse.json({ error: 'No se pudo encolar el envío' }, { status: 500 });
  if (!actualizada || actualizada.length === 0) {
    return NextResponse.json({ error: 'Esta campaña ya se está enviando o ya se envió' }, { status: 409 });
  }

  // El CAS de arriba ya dejó la campaña en ENVIANDO. Si el encolado falla
  // (Inngest caído, INNGEST_EVENT_KEY rotada) y no se deshace, la campaña se
  // queda en «Enviando…» para siempre: el propio CAS impide reintentarla, no
  // hay barrido de ENVIANDO atascadas y ninguna pantalla la devuelve a
  // BORRADOR. Devolverla es lo que le da una SALIDA a la propietaria.
  try {
    await inngest.send({ name: EVENTS.CAMPANA_ENVIAR, data: { campanaId, studioId: sesion.studioId } });
  } catch (e) {
    await admin.from('campanas').update({ estado: 'BORRADOR' })
      .eq('id', campanaId).eq('studio_id', sesion.studioId).eq('estado', 'ENVIANDO');
    Sentry.captureException(e instanceof Error ? e : new Error('campana enviar: encolado'), {
      level: 'error', tags: { area: 'marketing' }, extra: { campanaId, studioId: sesion.studioId },
    });
    return NextResponse.json({ error: 'No se ha podido encolar el envío. Vuelve a intentarlo.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
