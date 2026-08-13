import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { mapCampana } from '@/lib/supabase-data';
import type { RowCampanas } from '@/lib/db-types';

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

  await inngest.send({ name: EVENTS.CAMPANA_ENVIAR, data: { campanaId, studioId: sesion.studioId } });

  return NextResponse.json({ ok: true });
}
