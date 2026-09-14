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

  // Solo quien gestiona el calendario. La instructora cancelaba reservas de sus
  // clases desde el panel; con Tentare Core retirado (14-sep-2026) eso es trabajo
  // de mostrador y aquí recibe 403 como cualquier otro rol sin permiso.
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const r = await ejecutarCancelacionReserva(admin, {
    studioId: sesion.studioId, reservaId: body.reservaId, socioId: null,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
