import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';

// Alterna el "me gusta" de la socia sobre un post del tablón — antes era de
// solo lectura en el portal (ver migración toggle_like_post_portal). Mismo
// patrón que el resto de /api/public/*: la socia no llega a auth.uid() en
// RLS normal, así que esta ruta usa service-role y resuelve/valida la
// identidad a mano antes de llamar a la RPC.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-like', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' ? body.studioId : null;
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;

  const { data, error } = await admin.rpc('toggle_like_post_portal', {
    p_post_id: id,
    p_studio_id: studioId,
    p_auth_user_id: user.userId,
  });

  if (error) {
    if (error.message.includes('POST_NOT_FOUND')) return NextResponse.json({ error: 'Publicación no encontrada.' }, { status: 404 });
    return errorInterno('public/comunidad/posts/like:POST', error, 'No se ha podido guardar tu me gusta.');
  }

  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ liked: Boolean(fila?.liked), likes: Number(fila?.likes ?? 0) });
}
