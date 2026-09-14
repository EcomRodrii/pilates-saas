import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { perfilDeInstructora } from '@/lib/portal-instructora/perfil-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// El Perfil de la instructora en la app del estudio: sus estudios y su tarifa.
// Solo lectura. La instructora y el estudio salen del token + slug.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-perfil', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const perfil = await perfilDeInstructora({
      userId: sesion.userId, studioId: sesion.studioId, instructorId: sesion.instructorId,
    });
    return NextResponse.json(perfil);
  } catch (err) {
    return errorInterno('portal/instructora/perfil:POST', err, 'No hemos podido cargar tu perfil.');
  }
}
