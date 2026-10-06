import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { denunciarComentario } from '@/lib/comunidad/comentarios-servidor';
import { TEXTO_GRACIAS_DENUNCIA } from '@/lib/moderacion/denuncias';

// La alumna denuncia un comentario del tablón (App Store 1.2). Lo revisa el
// estudio; si lo escribió una propietaria, Tentare. Quién es sale del token y de
// su ficha en ESTE estudio, y solo puede denunciar lo que puede ver.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-denunciar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: unknown; detalle?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId) return errorPeticion('Falta el estudio.');
  const detalle = typeof body?.detalle === 'string' ? body.detalle : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  try {
    const r = await denunciarComentario(admin, { studioId, socioId, authUserId: user.userId, comentarioId: id, detalle });
    if (!r) return NextResponse.json({ error: 'Este comentario ya no existe.' }, { status: 404 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, mensaje: TEXTO_GRACIAS_DENUNCIA });
  } catch (e) {
    return errorInterno('public/comunidad/denunciar:POST', e, 'No se ha podido enviar la denuncia. Inténtalo otra vez.');
  }
}
