import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// A-14 (backstop): marca un cobro por datáfono como RECONCILIADO una vez que su
// venta está registrada. Lo llama el POS tanto en el flujo normal (tras el tap
// exitoso) como al completar manualmente un cobro pendiente. Upsert por
// PaymentIntent: si el webhook aún no había dejado el marcador, se crea ya en
// estado RECONCILIADO; si existía PENDIENTE, se resuelve. Scopeado al estudio
// del JWT — solo se puede reconciliar un cobro del propio estudio.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { paymentIntentId?: unknown; ventaId?: unknown; importe?: unknown; concepto?: unknown }
    | null;
  const paymentIntentId = typeof body?.paymentIntentId === 'string' ? body.paymentIntentId : null;
  if (!paymentIntentId) return NextResponse.json({ error: 'Falta el paymentIntentId' }, { status: 400 });
  const ventaId = typeof body?.ventaId === 'string' ? body.ventaId : null;
  const importe = Number(body?.importe);
  const concepto = typeof body?.concepto === 'string' ? body.concepto : null;

  // Si ya existe un marcador para este PI (lo dejó el webhook), NO se puede
  // reconciliar el de otro estudio: se acota el UPDATE por studio_id.
  const { data: existente } = await admin
    .from('reconciliaciones_pos')
    .select('studio_id, estado')
    .eq('payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (existente) {
    if (existente.studio_id !== sesion.studioId) {
      return NextResponse.json({ error: 'No autorizado para este cobro' }, { status: 403 });
    }
    const { error } = await admin
      .from('reconciliaciones_pos')
      .update({ estado: 'RECONCILIADO', venta_id: ventaId, reconciliado_en: new Date().toISOString() })
      .eq('payment_intent_id', paymentIntentId)
      .eq('studio_id', sesion.studioId);
    if (error) return NextResponse.json({ error: 'No se pudo reconciliar' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Aún no hay marcador (el flujo normal llega antes que el webhook): se crea ya
  // reconciliado para que, cuando el webhook entregue su INSERT, choque (23505) y
  // no reabra el pendiente.
  const { error } = await admin.from('reconciliaciones_pos').insert({
    payment_intent_id: paymentIntentId,
    studio_id: sesion.studioId,
    importe: Number.isFinite(importe) && importe > 0 ? importe : 0,
    concepto,
    estado: 'RECONCILIADO',
    venta_id: ventaId,
    reconciliado_en: new Date().toISOString(),
  });
  // Carrera: el webhook insertó el PENDIENTE entre el SELECT y el INSERT. Se
  // resuelve con un UPDATE al RECONCILIADO.
  if (error?.code === '23505') {
    await admin
      .from('reconciliaciones_pos')
      .update({ estado: 'RECONCILIADO', venta_id: ventaId, reconciliado_en: new Date().toISOString() })
      .eq('payment_intent_id', paymentIntentId)
      .eq('studio_id', sesion.studioId);
    return NextResponse.json({ ok: true });
  }
  if (error) return NextResponse.json({ error: 'No se pudo reconciliar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
