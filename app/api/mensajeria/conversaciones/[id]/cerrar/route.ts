import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { cerrarConversacion } from '@/lib/moderacion/denuncias-servidor';

// Cerrar (o reabrir) un chat instructora–alumna desde el panel (App Store 1.2).
// Solo la propietaria, que es quien los lee (RLS, 20260914154415), y solo ese
// tipo: el hilo de una alumna con el estudio no se cierra nunca. Cerrado, nadie
// escribe en él (trigger `trg_mensajes_conversacion_abierta`) y las dos apps
// enseñan «Esta conversación ya no admite mensajes».
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede cerrar una conversación' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'mensajeria-cerrar', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { cerrar?: unknown } | null;
  const cerrar = body?.cerrar !== false;
  const { id } = await params;
  try {
    const cambiado = await cerrarConversacion(admin, { studioId: sesion.studioId, conversacionId: id, cerrar, userId: sesion.userId });
    return NextResponse.json({ cerrada: cerrar, cambiado });
  } catch (e) {
    return errorInterno('mensajeria/cerrar:POST', e, 'No se ha podido guardar. Inténtalo otra vez.');
  }
}
