import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { crearReservaExterna } from '@/lib/db/supabase-data-admin';
import { puedeApuntarEnClase } from '@/lib/reservas/reserva-mostrador';
import { avisoCupoTrasApuntar, leerPeticionReservaExterna } from '@/lib/plataformas/reserva-externa';

export const dynamic = 'force-dynamic';

// Recepción apunta una plaza que ha vendido ClassPass, Urban Sports Club o
// Wellhub. La persona no es socia: va sin ficha, sin bono y sin cobro, pero
// ocupa plaza en la clase igual que cualquiera (`crearReservaExterna`).
//
// El estudio SIEMPRE sale de la sesión de staff, nunca del body. La RPC corre
// con service-role, donde su guardia de rol no aplica: la autorización vive
// aquí, con el mismo criterio que apuntar a una clienta (propietaria, gerencia
// y recepción; la instructora no apunta desde el panel).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeApuntarEnClase(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para apuntar a nadie en esta clase.' }, { status: 403 });
  }

  const peticion = leerPeticionReservaExterna(await req.json().catch(() => null));
  if (!peticion.ok) return NextResponse.json({ error: peticion.error }, { status: 400 });
  const { sesionId, reservaId, plataforma, nombre, codigo } = peticion.datos;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // La plataforma tiene que estar activada en Conexiones: así una clase de un
  // estudio que no vende fuera no recibe reservas «de ClassPass» por error.
  const { data: integracion } = await admin
    .from('integraciones').select('activo')
    .eq('studio_id', sesion.studioId).eq('tipo', plataforma).maybeSingle();
  if (!integracion?.activo) {
    return NextResponse.json({ error: 'Activa esta plataforma en Configuración → Conexiones para poder apuntar sus reservas.' }, { status: 409 });
  }

  const r = await crearReservaExterna({ studioId: sesion.studioId, sesionId, reservaId, plataforma, nombre, codigo });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ...r, aviso: avisoCupoTrasApuntar(plataforma, r.cupo, r.cupoUsado) });
}
