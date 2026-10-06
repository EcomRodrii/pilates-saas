import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { instanteDelMensaje, leerHasta, marcarAvisosDeConversacionLeidos } from '@/lib/mensajeria/avisos-leidos';

// Marca leída la fila SOCIO de `conversacion_participantes` HASTA el último
// mensaje que la app ha pintado (`hasta`, ver lib/mensajeria/avisos-leidos.ts):
// uno que llegó después de cargar el hilo no se ha visto y sigue sin leer. Sin
// `hasta` (app anterior) se marca hasta ahora, como antes.
//
// Con service-role, sin RLS que proteja a la socia (su JWT de Supabase no abre
// la mensajería por PostgREST: `es_participante_conversacion` solo cuenta filas
// del equipo), así que se comprueba la participación a mano antes de escribir
// nada — mismo criterio que GET/POST de mensajes en esta misma carpeta.
//
// Y apaga sus avisos de ese hilo en la campana (`marcarAvisosDeConversacionLeidos`):
// si eso falla, 500, para que la app no apague el punto de la campana por su
// cuenta con los avisos sin leer.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null) as { studioId?: string; hasta?: unknown } | null;
  if (!body?.studioId) return errorPeticion('Falta el estudio.');
  const hasta = leerHasta(body);

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

  try {
    // Hasta qué instante: el del mensaje pintado (si es de este hilo).
    const instante = typeof hasta === 'string' ? await instanteDelMensaje(admin, id, hasta) : null;
    // Sin nada pintado (hilo vacío) no hay nada que marcar.
    if (hasta !== undefined && !instante) return new NextResponse(null, { status: 204 });

    let marca = admin
      .from('conversacion_participantes')
      .update({ leido_hasta: instante ?? new Date().toISOString() })
      .eq('conversacion_id', id)
      .eq('socio_id', socioId);
    // Nunca hacia atrás: otro dispositivo pudo leer más.
    if (instante) marca = marca.lt('leido_hasta', instante);
    const { error } = await marca;
    if (error) return errorInterno('public/mensajeria/leido:PATCH', error, 'No se ha podido marcar como leído.');

    const errorAvisos = await marcarAvisosDeConversacionLeidos(admin, {
      userId: user.userId, studioId: body.studioId, conversacionId: id, lado: 'alumna',
      ...(instante ? { hasta: instante } : {}),
    });
    if (errorAvisos) return errorInterno('public/mensajeria/leido:PATCH:avisos', errorAvisos, 'No se ha podido marcar como leído.');
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorInterno('public/mensajeria/leido:PATCH', e, 'No se ha podido marcar como leído.');
  }
}
