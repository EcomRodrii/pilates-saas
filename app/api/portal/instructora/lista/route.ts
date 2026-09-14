import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { listaDeClase, marcarAsistencia } from '@/lib/portal-instructora/lista-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Pasar lista desde la app del estudio: leer la lista de una clase suya y marcar
// «Asistió» (o deshacerlo). Nunca «no vino»: ver `lib/portal-instructora/lista-servidor.ts`.
//
// La instructora y el estudio salen del token + slug; del body solo la clase, la
// reserva y la acción. Una clase ajena responde igual que una que no existe.
export async function POST(req: NextRequest) {
  // Holgado: se marca una alumna por toque, y una clase llena son 12-15 seguidos.
  const limited = await enforceRateLimit(req, 'portal-instructora-lista', { max: 90, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as
    { slug?: string; sesionId?: unknown; reservaId?: unknown; accion?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const sesionId = typeof body.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'leer' && accion !== 'asistio' && accion !== 'deshacer') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const reservaId = typeof body.reservaId === 'string' ? body.reservaId : null;
  if (accion !== 'leer' && !reservaId) return NextResponse.json({ error: 'Falta la alumna' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const clase = { studioId: sesion.studioId, instructorId: sesion.instructorId, sesionId };

    if (accion === 'leer') {
      const lista = await listaDeClase(clase);
      if (!lista) return NextResponse.json({ error: 'No encontramos esta clase.' }, { status: 404 });
      return NextResponse.json(lista);
    }

    const r = await marcarAsistencia({ ...clase, reservaId: reservaId as string, accion });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, estado: r.estado });
  } catch (err) {
    return errorInterno('portal/instructora/lista:POST', err, 'No hemos podido guardar la lista. Vuelve a intentarlo.');
  }
}
