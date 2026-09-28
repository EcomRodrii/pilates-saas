import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { historialDeAccesos } from '@/lib/acceso/historial-servidor';
import { hoyEnEstudio } from '@/lib/utils';

// GET /api/acceso/historial?dia=YYYY-MM-DD  → quién intentó entrar ese día
// GET /api/acceso/historial?socioId=…       → los accesos de una alumna
//
// Quién: los mismos que pueden escanear en el panel y leer `accesos_escaneos`
// por RLS (propietaria, gerencia, recepción). El estudio sale de la sesión.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'acceso-historial', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;

  const params = new URL(req.url).searchParams;
  const socioId = params.get('socioId');
  const dia = params.get('dia') ?? hoyEnEstudio();
  if (!socioId && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return errorPeticion('Fecha no válida', 400);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('acceso/historial', new Error('sin service-role'), 'No hemos podido cargar el historial.');
  try {
    const filas = await historialDeAccesos(admin, sesion.studioId, socioId ? { socioId } : { dia }, socioId ? 30 : 200);
    return NextResponse.json({ filas });
  } catch (err) {
    return errorInterno('acceso/historial:GET', err, 'No hemos podido cargar el historial.');
  }
}
