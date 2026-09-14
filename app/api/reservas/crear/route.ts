import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { crearReservaMostrador } from '@/lib/db/supabase-data-admin';
import { leerPeticionReservaMostrador, puedeApuntarEnClase } from '@/lib/reservas/reserva-mostrador';
import { MENSAJE_RESERVA_RPC } from '@/lib/reservas/errores-rpc';

export const dynamic = 'force-dynamic';

// El mostrador apunta a una clienta a una clase desde el panel. Antes el
// navegador llamaba a `reservar_plaza` directo; ahora la reserva, el bono, los
// créditos y el aviso a la alumna los hace el servidor (`crearReservaMostrador`).
//
// El estudio SIEMPRE sale de la sesión de staff, nunca del body — mismo
// criterio que el resto de rutas de `app/api/reservas/`.
//
// Autorización: la misma que hacía la RPC cuando la llamaba el navegador. Con
// service-role su guardia de INSTRUCTOR no corre (`es_llamada_servicio()`), así
// que se repite aquí, contra la BD y no contra lo que diga el cliente.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const peticion = leerPeticionReservaMostrador(await req.json().catch(() => null));
  if (!peticion.ok) return NextResponse.json({ error: peticion.error }, { status: 400 });
  const { sesionId, socioId, reservaId, avisar } = peticion.datos;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: sesionRow } = await admin
    .from('sesiones').select('instructor_id')
    .eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!sesionRow) return NextResponse.json({ error: MENSAJE_RESERVA_RPC.SESION_NO_ENCONTRADA }, { status: 404 });

  // Solo hace falta resolver la ficha de instructora si el rol es INSTRUCTOR.
  // limit(1) y no maybeSingle(): mismo criterio que app/api/reservas/cancelar.
  let instructorIdStaff: string | null = null;
  if (sesion.rol === 'INSTRUCTOR') {
    const { data: instructorRows } = await admin
      .from('instructores').select('id')
      .eq('auth_user_id', sesion.userId).eq('studio_id', sesion.studioId)
      .neq('activo', false).order('id', { ascending: true }).limit(1);
    instructorIdStaff = (instructorRows?.[0]?.id as string | undefined) ?? null;
  }
  if (!puedeApuntarEnClase({
    rol: sesion.rol, instructorIdStaff,
    instructorIdClase: (sesionRow.instructor_id as string | null) ?? null,
  })) {
    return NextResponse.json({ error: MENSAJE_RESERVA_RPC.NO_AUTORIZADO }, { status: 403 });
  }

  const r = await crearReservaMostrador({
    studioId: sesion.studioId, sesionId, socioId, reservaId, avisarSocia: avisar,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
