import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { instanteDelMensaje, leerHasta, marcarAvisosDeConversacionLeidos } from '@/lib/mensajeria/avisos-leidos';

// Marca leída la fila propia de `conversacion_participantes` hasta el último
// mensaje que el panel ha pintado (`hasta`, ver lib/mensajeria/avisos-leidos.ts).
// Cliente de SESIÓN: la policy `conversacion_participantes_marca_leido` ya
// exige `auth_user_id = auth.uid()`.
//
// F-15 (auditoría 20ª pasada): en ALUMNA_MOSTRADOR el staff no tiene fila
// propia (decisión de diseño ya cerrada, ver migración 3/4 de Community &
// Messaging OS: el mostrador se resuelve dinámicamente vía
// puede_gestionar_calendario(), sin snapshot de STAFF) — el UPDATE de arriba
// simplemente no encuentra fila que tocar, y antes se quedaba ahí: el badge
// del mostrador nunca se apagaba para nadie. Se marca TAMBIÉN
// `conversaciones.mostrador_leido_hasta` (compartida, RLS acotada a
// ALUMNA_MOSTRADOR + puede_gestionar_calendario() en el propio estudio) —
// en las demás conversaciones ese UPDATE simplemente no casa ninguna fila
// (RLS lo descarta en silencio) y no hace nada.
//
// Después apaga sus avisos de ese hilo en la campana. Va con service-role porque
// `notification` no se escribe con la sesión, pero acotado a SU cuenta y SU
// estudio (`sesion.userId`, `sesion.studioId`): solo toca avisos suyos.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sesionCliente = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { id } = await params;
  const hasta = leerHasta(await req.json().catch(() => null));

  try {
    // Hasta el último mensaje que el panel ha pintado (con SU sesión: si no lo
    // ve, no cuenta). Sin `hasta` (panel anterior), hasta ahora, como antes.
    const instante = typeof hasta === 'string' ? await instanteDelMensaje(sesionCliente, id, hasta) : null;
    if (hasta !== undefined && !instante) return new NextResponse(null, { status: 204 });
    const marca = instante ?? new Date().toISOString();

    let propia = sesionCliente
      .from('conversacion_participantes')
      .update({ leido_hasta: marca })
      .eq('conversacion_id', id)
      .eq('auth_user_id', sesion.userId);
    let mostrador = sesionCliente
      .from('conversaciones')
      .update({ mostrador_leido_hasta: marca })
      .eq('id', id);
    // Nunca hacia atrás: la marca del mostrador es de todo el equipo, y otra
    // persona de recepción pudo leer más que lo que esta pantalla ha pintado.
    if (instante) {
      propia = propia.lt('leido_hasta', instante);
      mostrador = mostrador.or(`mostrador_leido_hasta.is.null,mostrador_leido_hasta.lt."${instante}"`);
    }
    const [{ error: errorPropio }, { error: errorMostrador }] = await Promise.all([propia, mostrador]);

    if (errorPropio) return errorInterno('mensajeria:leido:PATCH', errorPropio, 'No se ha podido marcar como leído.');
    if (errorMostrador) return errorInterno('mensajeria:leido:PATCH:mostrador', errorMostrador, 'No se ha podido marcar como leído.');

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
    const errorAvisos = await marcarAvisosDeConversacionLeidos(admin, {
      userId: sesion.userId, studioId: sesion.studioId, conversacionId: id, lado: 'equipo',
      ...(instante ? { hasta: instante } : {}),
    });
    if (errorAvisos) return errorInterno('mensajeria:leido:PATCH:avisos', errorAvisos, 'No se ha podido marcar como leído.');
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorInterno('mensajeria:leido:PATCH', e, 'No se ha podido marcar como leído.');
  }
}
