import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { borrarComentarioPropio } from '@/lib/comunidad/comentarios-servidor';

// La alumna borra un comentario suyo del tablón (App Store 1.2: quien publica
// puede quitar lo suyo). Quién es sale del token y de su ficha en ESTE estudio;
// un comentario que no es suyo responde igual que uno que no existe.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-comentario-borrar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : '';
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  try {
    const r = await borrarComentarioPropio(admin, { studioId, socioId, authUserId: user.userId, comentarioId: id });
    if (!r) return NextResponse.json({ error: 'Este comentario ya no existe.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('public/comunidad/comentarios:DELETE', e, 'No se ha podido borrar el comentario.');
  }
}
