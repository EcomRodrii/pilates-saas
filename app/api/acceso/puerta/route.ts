import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { abrirPuertaTrasEscaneo } from '@/lib/acceso/escanear-servidor';
import { marcadoresDelPanel } from '@/lib/acceso/marcadores-panel';

// POST { escaneoId } → «Abrir la puerta» tras un 🟢 en el control de acceso.
//
// Con un QR permanente la puerta de Kisi no se abre sola (decisión del
// fundador, 28-sep): la abre quien está mirando, con este botón. La prueba de
// que puede entrar es su escaneo 🟢 reciente en el historial, no nada que
// llegue en el body.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'acceso-puerta', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { escaneoId?: unknown } | null;
  const escaneoId = typeof body?.escaneoId === 'number' && Number.isSafeInteger(body.escaneoId) ? body.escaneoId : null;
  if (!escaneoId) return errorPeticion('Faltan datos', 400);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('acceso/puerta', new Error('sin service-role'), 'No se ha podido abrir la puerta.');
  try {
    const actor = { uid: sesion.userId, rol: sesion.rol, studioId: sesion.studioId, origen: 'PANEL' as const, puedeAprobar: true };
    const r = await abrirPuertaTrasEscaneo(admin, actor, marcadoresDelPanel(sesion.studioId), { escaneoId });
    if ('error' in r) return errorPeticion(r.error, r.status);
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('acceso/puerta:POST', err, 'No se ha podido abrir la puerta.');
  }
}
