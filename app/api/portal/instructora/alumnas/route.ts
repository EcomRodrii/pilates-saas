import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { alumnasDeInstructora, fichaDeAlumna, saludDeAlumna } from '@/lib/portal-instructora/alumnas-servidor';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// «Tus alumnas» desde la app del estudio: la lista de sus alumnas, la ficha
// mínima de una y su salud. Solo lectura. Las reglas viven en
// `lib/portal-instructora/alumnas-servidor.ts`.
//
// La instructora y el estudio salen del token + slug. `listar` no recibe ningún
// id; `ficha` y `salud` reciben el de la socia y responden igual (404) si no
// existe que si no es su alumna. `salud` apunta la lectura antes de devolver
// nada y, si no puede, falla.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-alumnas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown; socioId?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'listar' && accion !== 'ficha' && accion !== 'salud') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const socioId = typeof body.socioId === 'string' && body.socioId ? body.socioId : null;
  if (accion !== 'listar' && !socioId) return NextResponse.json({ error: 'Falta la alumna' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const suya = { studioId: sesion.studioId, instructorId: sesion.instructorId };

    if (accion === 'listar') {
      return NextResponse.json({ alumnas: await alumnasDeInstructora(suya) });
    }

    if (accion === 'salud') {
      // Cada apertura escribe en el registro de lecturas: tope propio por
      // INSTRUCTORA (no por IP) para que nadie lo llene de ruido.
      const porInstructora = { max: 20, windowSeconds: 60 };
      const limite = await rateLimit(`portal-instructora-salud:${sesion.instructorId}`, porInstructora);
      if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, porInstructora.windowSeconds));
      const salud = await saludDeAlumna({
        ...suya, socioId: socioId as string, lector: { userId: sesion.userId, nombre: sesion.nombre },
      });
      if (!salud) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
      return NextResponse.json(salud, { headers: { 'Cache-Control': 'no-store' } });
    }

    const ficha = await fichaDeAlumna({ ...suya, socioId: socioId as string });
    if (!ficha) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
    return NextResponse.json(ficha);
  } catch (err) {
    return accion === 'salud'
      ? errorInterno('portal/instructora/alumnas:salud', err, 'No hemos podido abrir sus avisos de salud. Vuelve a intentarlo.')
      : errorInterno('portal/instructora/alumnas:POST', err, 'No hemos podido cargar tus alumnas. Vuelve a intentarlo.');
  }
}
