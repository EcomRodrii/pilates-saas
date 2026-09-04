import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { ejecutarCancelacionReserva } from '@/lib/db/supabase-data-admin';

export const dynamic = 'force-dynamic';

// Auditoría 21ª pasada (2-sep-2026), P-1: `cancelarReserva`/`bajaConRecuperacion`
// (lib/studio-context.tsx) llamaban a `cancelar_reserva_plaza` DIRECTO desde el
// navegador (`dbCancelarReservaPlaza`, cliente autenticado) en vez de pasar por
// `ejecutarCancelacionReserva` — el mismo camino que YA usa el portal
// (`cancelarReservaPublica`). Consecuencia real: ninguna de las 3 notificaciones
// del Notification Engine (`emitirReservaCancelada`, `emitirPlazaLiberada`,
// `emitirOfertaListaEspera`) se disparaba desde el panel. Peor caso, con la
// lista de espera con oferta activa: se abre una oferta con plazo, nadie se lo
// dice a la socia, y el cron se la quita al caducar sin que se haya enterado de
// que la tuvo.
//
// El estudio SIEMPRE se resuelve de la sesión de staff, nunca del body — mismo
// criterio que el resto de rutas de `app/api/reservas/`.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => null) as { reservaId?: string } | null;
  if (!body?.reservaId) return NextResponse.json({ error: 'Falta reservaId' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (!puedeGestionarCalendario(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    // `cancelar_reserva_plaza` ya restringe a INSTRUCTOR a sus propias clases,
    // pero esa guardia mira `auth.uid()`/`current_rol()` — con `admin`
    // (service-role) `auth.uid()` es NULL y quedaría bypaseada en silencio,
    // igual que ya pasa con `resolver_reserva_pendiente`. Se replica aquí.
    const { data: reservaRow } = await admin
      .from('reservas').select('sesion_id').eq('id', body.reservaId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!reservaRow?.sesion_id) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    const { data: sesionRow } = await admin
      .from('sesiones').select('instructor_id').eq('id', reservaRow.sesion_id as string).maybeSingle();
    // limit(1) en vez de maybeSingle(): no hay UNIQUE(auth_user_id, studio_id)
    // en `instructores` — mismo criterio que app/api/mi-disponibilidad/route.ts.
    const { data: instructorRows } = await admin
      .from('instructores').select('id')
      .eq('auth_user_id', sesion.userId).eq('studio_id', sesion.studioId)
      .neq('activo', false).order('id', { ascending: true }).limit(1);
    const instructorId = (instructorRows?.[0]?.id as string | undefined) ?? null;
    if (!instructorId || sesionRow?.instructor_id !== instructorId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const r = await ejecutarCancelacionReserva(admin, {
    studioId: sesion.studioId, reservaId: body.reservaId, socioId: null,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
