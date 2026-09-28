import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { decidirEscaneo, type AccionAcceso } from '@/lib/acceso/escanear-servidor';
import { marcadoresDelPanel } from '@/lib/acceso/marcadores-panel';

// POST { escaneoId, decision } → lo que se decide tras un 🟠 en el panel:
// «Aprobar y dejar pasar» (la aprobación de siempre), «Dejar pasar» o «No
// permitir acceso». Queda como fila nueva del historial, una por escaneo.
const DECISIONES: readonly AccionAcceso[] = ['APROBAR', 'DEJAR_PASAR', 'NO_PERMITIR'];

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'acceso-decidir', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { escaneoId?: unknown; decision?: unknown } | null;
  const escaneoId = typeof body?.escaneoId === 'number' && Number.isSafeInteger(body.escaneoId) ? body.escaneoId : null;
  const decision = DECISIONES.find(d => d === body?.decision) ?? null;
  if (!escaneoId || !decision) return errorPeticion('Faltan datos', 400);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('acceso/decidir', new Error('sin service-role'), 'No se ha podido guardar.');
  try {
    const actor = { uid: sesion.userId, rol: sesion.rol, studioId: sesion.studioId, origen: 'PANEL' as const, puedeAprobar: true };
    const r = await decidirEscaneo(admin, actor, marcadoresDelPanel(sesion.studioId), { escaneoId, decision });
    if ('error' in r) return errorPeticion(r.error, r.status);
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('acceso/decidir:POST', err, 'No se ha podido guardar.');
  }
}
