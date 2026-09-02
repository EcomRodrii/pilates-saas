import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowSocioCompaneras } from '@/lib/db-types';

// F-25 (auditoría 20ª pasada): bloquear era irreversible en la práctica —
// la API ya devolvía `bloqueadasPorMi` (pensado desde el principio, ver el
// comentario de la ruta de bloquear) pero no existía ni pantalla ni ruta de
// vuelta. Solo QUIEN bloqueó puede desbloquear — mismo principio de
// privacidad que el resto de esta pieza: la parte bloqueada nunca debe
// enterarse de que hubo un bloqueo, así que tampoco puede deshacerlo.
//
// Se BORRA la fila, no se revierte a 'pendiente'/'aceptada': un bloqueo
// puede haberse dado sobre una solicitud pendiente o sobre una relación ya
// aceptada, y "restaurar" ese estado automáticamente decidiría por la socia
// algo que no ha pedido (¿de verdad quiere volver a ser compañera, o solo
// quiere poder recibir una solicitud nueva si la otra parte la manda?).
// Borrar deja a las dos partes en el mismo punto de partida que si nunca
// hubieran interactuado — la solicitud, si alguien la quiere, se vuelve a
// enviar a mano.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-social-companeras-desbloquear', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string } | null;
  if (!body?.studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: fila } = await admin
    .from('socio_companeras')
    .select('*')
    .eq('id', id)
    .eq('studio_id', body.studioId)
    .maybeSingle();
  const relacion = fila as RowSocioCompaneras | null;

  // No solo "es una de las dos partes" (como en bloquear): tiene que ser
  // QUIEN bloqueó. Si fuera la parte bloqueada, ni siquiera debería saber
  // que esta fila existe — `GET /companeras` ya la excluye para ella.
  if (!relacion || relacion.estado !== 'bloqueada' || relacion.bloqueada_por !== socioId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { error } = await admin.from('socio_companeras').delete().eq('id', id);
  if (error) return errorInterno('public/social/companeras/desbloquear:POST', error, 'No se ha podido desbloquear.');

  return NextResponse.json({ id });
}
