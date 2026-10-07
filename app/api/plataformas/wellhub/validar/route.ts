import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeApuntarEnClase } from '@/lib/reservas/reserva-mostrador';
import { credencialesWellhub } from '@/lib/plataformas/wellhub/cliente';
import { validarAsistenciaWellhub } from '@/lib/plataformas/wellhub/servidor';

export const dynamic = 'force-dynamic';

// Pasar lista a una socia de Wellhub desde el panel valida su check-in en
// Wellhub: es lo que hace que Wellhub pague la visita (su «Attendance Trigger»,
// el segundo método de validación que exige junto al automático del webhook).
// Lo llama el panel justo después de marcarla como venida y le enseña a
// recepción el motivo si Wellhub dice que no (lo recomienda su doc).
//
// El estudio SIEMPRE sale de la sesión de staff, nunca del body; mismo permiso
// que pasar lista en el mostrador.
const RESERVA_ID = /^res-[A-Za-z0-9_-]{1,140}$/;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeApuntarEnClase(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para pasar lista.' }, { status: 403 });

  const cuerpo = await req.json().catch(() => null) as { reservaId?: unknown } | null;
  const reservaId = typeof cuerpo?.reservaId === 'string' && RESERVA_ID.test(cuerpo.reservaId) ? cuerpo.reservaId : null;
  if (!reservaId) return NextResponse.json({ error: 'Reserva no válida' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const aviso = await validarAsistenciaWellhub(admin, credencialesWellhub(), { studioId: sesion.studioId, reservaId });
  return NextResponse.json({ ok: true, aviso });
}
