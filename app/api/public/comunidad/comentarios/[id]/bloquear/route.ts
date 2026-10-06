import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { bloquearAutoraDelComentario } from '@/lib/comunidad/comentarios-servidor';

// La alumna bloquea a la compañera que escribió un comentario del tablón (App
// Store 1.2): desde ese momento no se ven los comentarios la una de la otra, y
// el estudio recibe un aviso para revisarlo. Es el mismo bloqueo de las
// compañeras de clase (`socio_companeras`), y se deshace en Perfil › Privacidad
// y datos. Quién es sale del token y de su ficha; nunca va la ficha de la otra.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-comunidad-bloquear', { max: 20, windowSeconds: 60 });
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
    const r = await bloquearAutoraDelComentario(admin, { studioId, socioId, authUserId: user.userId, comentarioId: id });
    if (!r) return NextResponse.json({ error: 'Este comentario ya no existe.' }, { status: 404 });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('public/comunidad/bloquear:POST', e, 'No se ha podido bloquear. Inténtalo otra vez.');
  }
}
