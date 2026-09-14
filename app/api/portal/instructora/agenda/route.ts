import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { agendaDeInstructora } from '@/lib/portal-instructora/agenda-servidor';
import { rangoAgendaValido } from '@/lib/student/agenda-instructora';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Agenda de la instructora (app del estudio): las clases que imparte en un rango
// de días y el estado de las bajas que ha pedido.
//
// La identidad (instructora y estudio) sale del token + slug verificados; del
// body solo se aceptan las fechas. POST y no GET, como el resto de rutas de la
// app: ningún identificador acaba en la URL ni en los logs del CDN.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-agenda', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; desde?: unknown; hasta?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  if (!rangoAgendaValido(body.desde, body.hasta)) {
    return NextResponse.json({ error: 'Fechas no válidas' }, { status: 400 });
  }

  try {
    // Dentro del `try`: un fallo al verificar (base de datos caída) se registra
    // y responde con el mensaje genérico, igual que el resto de la ruta.
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const agenda = await agendaDeInstructora({
      studioId: sesion.studioId,
      instructorId: sesion.instructorId,
      desde: body.desde as string,
      hasta: body.hasta as string,
    });
    return NextResponse.json(agenda);
  } catch (err) {
    return errorInterno('portal/instructora/agenda:POST', err, 'No hemos podido cargar tu agenda. Vuelve a intentarlo.');
  }
}
