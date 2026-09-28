import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { regenerarQr } from '@/lib/acceso/qr-alumna-servidor';

// El QR de acceso de una alumna, desde su ficha en el panel.
//
//   GET  ?socioId=… → { controlActivo, qrDesde }: desde cuándo vale el suyo.
//                     Nunca el QR: el panel no lo necesita y no tiene por qué
//                     viajar.
//   POST { socioId } → uno nuevo: el anterior deja de valer en el acto (lo
//                     perdió, compartió una captura…). Ella verá el nuevo al
//                     abrir su app.
//
// Quién: los mismos que escanean en el panel. El estudio sale de la sesión, y la
// alumna tiene que ser de ESE estudio.

async function contexto(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeGestionarCalendario(sesion.rol)) return { res: NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 }) };
  const admin = getSupabaseAdmin();
  if (!admin) return { res: errorInterno('acceso/qr-alumna', new Error('sin service-role'), 'No hemos podido completar la acción.') };
  return { sesion, admin };
}

async function esSuya(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string, socioId: string) {
  const { data } = await admin.from('socios').select('id').eq('id', socioId).eq('studio_id', studioId).is('borrado_en', null).maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const c = await contexto(req);
  if ('res' in c) return c.res;
  const socioId = new URL(req.url).searchParams.get('socioId');
  if (!socioId) return errorPeticion('Falta la alumna', 400);
  try {
    if (!(await esSuya(c.admin, c.sesion.studioId, socioId))) return errorPeticion('No encontramos a esta alumna.', 404);
    const [{ data: est }, { data: fila }] = await Promise.all([
      c.admin.from('studios').select('control_acceso_qr').eq('id', c.sesion.studioId).single(),
      c.admin.from('socios_qr_acceso').select('creado_en').eq('studio_id', c.sesion.studioId).eq('socio_id', socioId).is('revocado_en', null).maybeSingle(),
    ]);
    return NextResponse.json({ controlActivo: est?.control_acceso_qr !== false, qrDesde: (fila?.creado_en as string | undefined) ?? null });
  } catch (err) {
    return errorInterno('acceso/qr-alumna:GET', err, 'No hemos podido cargar su QR.');
  }
}

export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if ('res' in c) return c.res;
  const limited = await enforceRateLimit(req, 'acceso-qr-alumna', { max: 10, windowSeconds: 60 }, c.sesion.userId);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { socioId?: unknown } | null;
  const socioId = typeof body?.socioId === 'string' ? body.socioId : null;
  if (!socioId) return errorPeticion('Falta la alumna', 400);
  try {
    if (!(await esSuya(c.admin, c.sesion.studioId, socioId))) return errorPeticion('No encontramos a esta alumna.', 404);
    const { data: est } = await c.admin.from('studios').select('control_acceso_qr').eq('id', c.sesion.studioId).single();
    if (est?.control_acceso_qr === false) return errorPeticion('El control de acceso con QR está desactivado en este estudio.', 409);
    const qr = await regenerarQr(c.admin, { studioId: c.sesion.studioId, socioId }, 'ESTUDIO');
    return NextResponse.json({ qrDesde: qr.creadoEn });
  } catch (err) {
    return errorInterno('acceso/qr-alumna:POST', err, 'No hemos podido generar el QR nuevo.');
  }
}
