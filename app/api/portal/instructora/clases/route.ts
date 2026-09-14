import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { crearClasePropia, opcionesNuevaClase } from '@/lib/portal-instructora/crear-clase-servidor';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// «Nueva clase» de la instructora desde la app del estudio: las opciones (tipos y
// salas, si el estudio le deja crear) y crearla. Las reglas viven en
// `lib/portal-instructora/crear-clase-servidor.ts`, que repite a mano lo que exige
// la RLS porque esta ruta va con service-role.
//
// La instructora y el estudio salen del token + slug. Del body solo el tipo, la
// sala, el día y la hora: ni instructora, ni aforo, ni fin, ni precio.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-clases', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as
    { slug?: string; accion?: unknown; tipoClaseId?: unknown; salaId?: unknown; fecha?: unknown; hora?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'opciones' && accion !== 'crear') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const datos = { tipoClaseId: texto(body.tipoClaseId), salaId: texto(body.salaId), fecha: texto(body.fecha), hora: texto(body.hora) };
  if (accion === 'crear') {
    if (!datos.tipoClaseId || !datos.salaId || !datos.fecha || !datos.hora) {
      return NextResponse.json({ error: 'Faltan datos de la clase' }, { status: 400 });
    }
    // Crear es lo que escribe: límite propio y más bajo.
    const limitadoCrear = await enforceRateLimit(req, 'portal-instructora-clases-crear', { max: 10, windowSeconds: 60 });
    if (limitadoCrear) return limitadoCrear;
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (accion === 'crear') {
      // Por INSTRUCTORA, no por IP (`enforceRateLimit` mete la IP en la clave): con
      // datos móviles y wifi el límite de arriba se multiplica. Un tope por hora
      // que ninguna planificación real alcanza.
      const porInstructora = { max: 30, windowSeconds: 3600 };
      const limite = await rateLimit(`portal-instructora-clases-crear:${sesion.instructorId}`, porInstructora);
      if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, porInstructora.windowSeconds));
    }

    if (accion === 'opciones') {
      return NextResponse.json(await opcionesNuevaClase({ studioId: sesion.studioId }));
    }

    const r = await crearClasePropia({
      studioId: sesion.studioId,
      instructorId: sesion.instructorId,
      tipoClaseId: datos.tipoClaseId as string,
      salaId: datos.salaId as string,
      fecha: datos.fecha as string,
      hora: datos.hora as string,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, sesionId: r.sesionId, inicio: r.inicio });
  } catch (err) {
    return errorInterno('portal/instructora/clases:POST', err, 'No hemos podido crear la clase. Vuelve a intentarlo.');
  }
}
