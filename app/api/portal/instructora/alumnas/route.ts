import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { alumnasDeInstructora, fichaDeAlumna } from '@/lib/portal-instructora/alumnas-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// «Tus alumnas» desde la app del estudio: la lista de sus alumnas y la ficha
// mínima de una. Solo lectura. Las reglas viven en
// `lib/portal-instructora/alumnas-servidor.ts`.
//
// La instructora y el estudio salen del token + slug. `listar` no recibe ningún
// id; `ficha` recibe el de la socia y responde igual (404) si no existe que si
// no es su alumna.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-alumnas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown; socioId?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'listar' && accion !== 'ficha') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const socioId = typeof body.socioId === 'string' && body.socioId ? body.socioId : null;
  if (accion === 'ficha' && !socioId) return NextResponse.json({ error: 'Falta la alumna' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const suya = { studioId: sesion.studioId, instructorId: sesion.instructorId };

    if (accion === 'listar') {
      return NextResponse.json({ alumnas: await alumnasDeInstructora(suya) });
    }

    const ficha = await fichaDeAlumna({ ...suya, socioId: socioId as string });
    if (!ficha) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
    return NextResponse.json(ficha);
  } catch (err) {
    return errorInterno('portal/instructora/alumnas:POST', err, 'No hemos podido cargar tus alumnas. Vuelve a intentarlo.');
  }
}
