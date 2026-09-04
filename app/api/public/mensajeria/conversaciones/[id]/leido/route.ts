import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';

// Marca `leido_hasta = now()` en la fila SOCIO de `conversacion_participantes`.
// Sin RLS que proteja a la socia (no llega a auth.uid()), así que se
// comprueba la participación a mano antes de escribir nada — mismo criterio
// que GET/POST de mensajes en esta misma carpeta.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null) as { studioId?: string } | null;
  if (!body?.studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: participa } = await admin
    .from('conversacion_participantes')
    .select('conversacion_id')
    .eq('conversacion_id', id)
    .eq('socio_id', socioId)
    .maybeSingle();
  if (!participa) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await admin
    .from('conversacion_participantes')
    .update({ leido_hasta: new Date().toISOString() })
    .eq('conversacion_id', id)
    .eq('socio_id', socioId);

  if (error) return errorInterno('public/mensajeria/leido:PATCH', error, 'No se ha podido marcar como leído.');
  return new NextResponse(null, { status: 204 });
}
