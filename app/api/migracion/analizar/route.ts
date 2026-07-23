import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { analizarArchivos, type ArchivoEntrada } from '@/lib/migracion/analizador';

// Migración Mágica · analizar: recibe los archivos tal cual los exportó la
// propietaria de su software anterior y devuelve el PLAN (entidad detectada,
// mapeo, muestras, cuarentena, avisos) SIN tocar la base de datos. La
// ejecución es otro endpoint y siempre pasa por revisión humana.
export const maxDuration = 60;

const MAX_ARCHIVOS = 8;
const MAX_BYTES_ARCHIVO = 2 * 1024 * 1024; // 2MB de texto por archivo (~20k filas)

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'migracion-analizar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'Sin permiso para importar datos' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { archivos?: ArchivoEntrada[] } | null;
  const archivos = Array.isArray(body?.archivos) ? body.archivos : [];
  if (archivos.length === 0) return NextResponse.json({ error: 'No has adjuntado ningún archivo' }, { status: 400 });
  if (archivos.length > MAX_ARCHIVOS) {
    return NextResponse.json({ error: `Máximo ${MAX_ARCHIVOS} archivos por análisis` }, { status: 400 });
  }
  for (const a of archivos) {
    if (typeof a?.nombre !== 'string' || typeof a?.contenido !== 'string') {
      return NextResponse.json({ error: 'Formato de archivos no válido' }, { status: 400 });
    }
    if (a.contenido.length > MAX_BYTES_ARCHIVO) {
      return NextResponse.json({ error: `"${a.nombre}" es demasiado grande (máx. 2MB por archivo)` }, { status: 400 });
    }
  }

  try {
    // Contexto del estudio para avisar de referencias inexistentes (planes,
    // instructoras, salas, servicios) ANTES de ejecutar nada.
    const [planes, instructores, salas, servicios] = await Promise.all([
      admin.from('planes_tarifa').select('nombre').eq('studio_id', sesion.studioId),
      admin.from('instructores').select('nombre').eq('studio_id', sesion.studioId),
      admin.from('salas').select('nombre').eq('studio_id', sesion.studioId),
      admin.from('citas_servicios').select('nombre').eq('studio_id', sesion.studioId),
    ]);
    const nombres = (r: { data: { nombre: string | null }[] | null }) =>
      (r.data ?? []).map(x => x.nombre ?? '').filter(Boolean);

    const plan = await analizarArchivos(archivos, {
      planes: nombres(planes),
      instructores: nombres(instructores),
      salas: nombres(salas),
      servicios: nombres(servicios),
    });
    return NextResponse.json(plan);
  } catch (err) {
    return errorInterno('migracion/analizar:POST', err, 'No se han podido analizar los archivos. Vuelve a intentarlo.');
  }
}
