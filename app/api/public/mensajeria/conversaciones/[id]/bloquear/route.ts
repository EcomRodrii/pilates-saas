import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { bloquearEnChat } from '@/lib/moderacion/chat-servidor';

// La alumna bloquea (o desbloquea) a su instructora en este estudio (App Store
// 1.2). Solo en un hilo instructora–alumna y solo su propia fila: desde ese
// momento nadie escribe en él y el estudio recibe un aviso para revisarlo.
// Quién es sale del token y de su ficha, nunca del body.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-mensajeria-bloquear', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: unknown; bloquear?: unknown; detalle?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId || typeof body?.bloquear !== 'boolean') return errorPeticion('Faltan datos.');
  const detalle = typeof body?.detalle === 'string' ? body.detalle : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  try {
    const r = await bloquearEnChat(admin, {
      studioId, conversacionId: id, bloquear: body.bloquear, detalle,
      yo: { tipo: 'ALUMNA', socioId, authUserId: user.userId },
    });
    if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, estado: r.estado });
  } catch (e) {
    return errorInterno('public/mensajeria/bloquear:POST', e, 'No se ha podido guardar. Inténtalo otra vez.');
  }
}
