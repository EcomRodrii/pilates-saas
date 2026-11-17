import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const dynamic = 'force-dynamic';

// Apunta que la propietaria de un estudio que AÚN NO PAGA ha visto la pantalla de elegir plan
// (billing_visitas_planes: una fila por estudio y día). Alimenta la alerta «ha mirado sus planes
// varios días y no contrata» de /interno. Solo cuenta días: ni qué plan miró ni cuánto estuvo.
// Nunca falla de cara a quien navega: es una señal, no una función.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'billing-visita-planes', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false });
  const sesion = await verificarSesionStaff(req);
  if (!sesion || sesion.rol !== 'PROPIETARIO') return NextResponse.json({ ok: false });

  const { data: estudio } = await admin.from('studios').select('subscription_id, cadena_id').eq('id', sesion.studioId).maybeSingle();
  // Quien ya paga (o va con una cadena que paga) no está «decidiendo»: no se apunta.
  if (!estudio || estudio.subscription_id || estudio.cadena_id) return NextResponse.json({ ok: false });

  const { error } = await admin.rpc('registrar_visita_planes', { p_studio_id: sesion.studioId });
  return NextResponse.json({ ok: !error });
}
