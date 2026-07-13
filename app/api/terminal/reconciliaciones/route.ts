import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// A-14 (backstop): cobros por datáfono confirmados en Stripe pero aún sin venta
// registrada (el POS se cerró tras el tap). Scopeado al estudio del JWT.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('reconciliaciones_pos')
    .select('payment_intent_id, importe, concepto, creado_en')
    .eq('studio_id', sesion.studioId)
    .eq('estado', 'PENDIENTE')
    .order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ error: 'No se pudo leer las reconciliaciones' }, { status: 500 });

  return NextResponse.json({
    pendientes: (data ?? []).map((r) => ({
      paymentIntentId: r.payment_intent_id,
      importe: Number(r.importe),
      concepto: r.concepto,
      creadoEn: r.creado_en,
    })),
  });
}
