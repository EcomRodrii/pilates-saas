import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { leerDisponibilidad, guardarDisponibilidad } from '@/lib/sustituciones/disponibilidad';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Disponibilidad de la instructora desde la app del estudio: cuándo puede cubrir.
// Sin franjas marcadas, `rankear_candidatas` no la propone nunca como sustituta.
//
// Tercera vía a la MISMA lógica (`lib/sustituciones/disponibilidad.ts`), junto al
// panel (`/api/mi-disponibilidad`, sesión de staff) y el enlace firmado
// (`/api/public/disponibilidad`). Cada una autoriza a su manera y ninguna mezcla
// mecanismos: aquí la sede sale del slug y la instructora del token.
//
// POST para leer y para guardar (`accion`), como el resto de rutas de la app:
// ningún identificador en la URL.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-disponibilidad', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown; celdas?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  if (body.accion !== 'leer' && body.accion !== 'guardar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    if (body.accion === 'leer') {
      return NextResponse.json({ celdas: await leerDisponibilidad(admin, sesion.instructorId) });
    }

    // Reemplazo completo, acotado a esta instructora Y a esta sede.
    const r = await guardarDisponibilidad(admin, {
      studioId: sesion.studioId, instructorId: sesion.instructorId, celdasRaw: body.celdas,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, guardadas: r.guardadas });
  } catch (err) {
    return errorInterno('portal/instructora/disponibilidad:POST', err,
      'No hemos podido guardar tu disponibilidad. Vuelve a intentarlo en unos segundos.');
  }
}
