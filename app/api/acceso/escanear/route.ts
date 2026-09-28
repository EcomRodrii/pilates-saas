import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { clasesDeAhora, escanearQr, type Actor } from '@/lib/acceso/escanear-servidor';
import { marcadoresDelPanel } from '@/lib/acceso/marcadores-panel';

// Control de acceso desde el panel (recepción, gerencia, propietaria).
//
//   GET  → las clases de ahora, para fijar una si se quiere.
//   POST → { lectura, sesionId? } → el resultado del escaneo.
//
// Quién: quien gestiona el calendario (propietaria, gerencia, recepción). La
// instructora escanea desde su app, en sus clases, por su propia puerta
// (`/api/portal/instructora/escanear`).

async function actorDelPanel(req: NextRequest): Promise<Actor | NextResponse> {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  return { uid: sesion.userId, rol: sesion.rol, studioId: sesion.studioId, origen: 'PANEL', puedeAprobar: true };
}

export async function GET(req: NextRequest) {
  const actor = await actorDelPanel(req);
  if (actor instanceof NextResponse) return actor;
  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('acceso/escanear:GET', new Error('sin service-role'), 'No hemos podido cargar las clases.');
  try {
    return NextResponse.json({ clases: await clasesDeAhora(admin, actor) });
  } catch (err) {
    return errorInterno('acceso/escanear:GET', err, 'No hemos podido cargar las clases.');
  }
}

export async function POST(req: NextRequest) {
  const actor = await actorDelPanel(req);
  if (actor instanceof NextResponse) return actor;
  // Por persona Y dispositivo (la clave es IP + usuario): en un iPad de recepción
  // que comparten varias, cada una tiene su propio cupo.
  const limited = await enforceRateLimit(req, 'acceso-escanear', { max: 60, windowSeconds: 60 }, actor.uid);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { lectura?: unknown; sesionId?: unknown } | null;
  const lectura = typeof body?.lectura === 'string' ? body.lectura.slice(0, 200) : '';
  const sesionId = typeof body?.sesionId === 'string' && body.sesionId ? body.sesionId : null;
  if (!lectura) return errorPeticion('Falta el QR', 400);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('acceso/escanear', new Error('sin service-role'), 'No hemos podido leer el QR.');
  try {
    const r = await escanearQr(admin, actor, marcadoresDelPanel(actor.studioId), { lectura, sesionId });
    if ('error' in r) return errorPeticion(r.error, r.status);
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('acceso/escanear:POST', err, 'No hemos podido leer el QR.');
  }
}
