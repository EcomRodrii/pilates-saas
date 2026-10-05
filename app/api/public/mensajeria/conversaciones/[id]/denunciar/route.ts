import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { denunciarMensaje } from '@/lib/moderacion/chat-servidor';
import { TEXTO_GRACIAS_DENUNCIA } from '@/lib/moderacion/denuncias';

// La alumna denuncia un mensaje de la otra parte (App Store 1.2). Quién es sale
// del token y de su ficha en ESTE estudio, nunca del body; `denunciarMensaje`
// comprueba que el hilo es suyo y que el mensaje no es suyo. Si el hilo es con
// el estudio, la denuncia la revisa Tentare.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-mensajeria-denunciar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: unknown; mensajeId?: unknown; detalle?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  const mensajeId = typeof body?.mensajeId === 'string' ? body.mensajeId : '';
  if (!studioId || !mensajeId) return errorPeticion('Faltan datos para denunciar el mensaje.');
  const detalle = typeof body?.detalle === 'string' ? body.detalle : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  try {
    const r = await denunciarMensaje(admin, {
      studioId, conversacionId: id, mensajeId, detalle,
      yo: { tipo: 'ALUMNA', socioId, authUserId: user.userId },
    });
    if (!r) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, mensaje: TEXTO_GRACIAS_DENUNCIA });
  } catch (e) {
    return errorInterno('public/mensajeria/denunciar:POST', e, 'No se ha podido enviar la denuncia. Inténtalo otra vez.');
  }
}
