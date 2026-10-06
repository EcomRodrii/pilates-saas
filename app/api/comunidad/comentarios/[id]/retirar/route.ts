import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeModerarComunidad } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { retirarComentario } from '@/lib/moderacion/denuncias-servidor';

// Retirar (o volver a mostrar) un comentario del tablón desde el panel, sin
// esperar a que lo denuncien (App Store 1.2: el estudio modera). Quien lo
// escribió deja de verlo publicado para las demás (lo ve marcado como
// retirado) y recibe un aviso; las denuncias pendientes de ese comentario
// quedan resueltas y se avisa a quien las hizo. Lo aplica
// `ocultar_comentario_comunidad`, con el contador del post.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeModerarComunidad(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para moderar la comunidad' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'comunidad-retirar', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { retirar?: unknown } | null;
  const retirar = body?.retirar !== false;
  const { id } = await params;
  try {
    const r = await retirarComentario(admin, { studioId: sesion.studioId, comentarioId: id, retirar, userId: sesion.userId });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    // Ya estaba así (otra persona lo hizo a la vez): no es un error, y la pantalla se pone al día.
    return NextResponse.json({ retirado: retirar, cambiado: r.cambiado });
  } catch (e) {
    return errorInterno('comunidad/comentarios/retirar:POST', e, 'No se ha podido guardar. Inténtalo otra vez.');
  }
}
