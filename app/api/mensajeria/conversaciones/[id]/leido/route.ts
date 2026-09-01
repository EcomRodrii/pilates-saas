import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';

// Marca `leido_hasta = now()` en la fila propia de `conversacion_participantes`.
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
  const ahora = new Date().toISOString();

  const [{ error: errorPropio }, { error: errorMostrador }] = await Promise.all([
    sesionCliente
      .from('conversacion_participantes')
      .update({ leido_hasta: ahora })
      .eq('conversacion_id', id)
      .eq('auth_user_id', sesion.userId),
    sesionCliente
      .from('conversaciones')
      .update({ mostrador_leido_hasta: ahora })
      .eq('id', id),
  ]);

  if (errorPropio) return errorInterno('mensajeria:leido:PATCH', errorPropio, 'No se ha podido marcar como leído.');
  if (errorMostrador) return errorInterno('mensajeria:leido:PATCH:mostrador', errorMostrador, 'No se ha podido marcar como leído.');
  return new NextResponse(null, { status: 204 });
}
