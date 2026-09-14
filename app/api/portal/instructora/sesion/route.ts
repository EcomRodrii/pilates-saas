import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// ¿La cuenta de la app es instructora de ESTE estudio?
//
// Aparte de `/api/public/session` a propósito: esa ruta la usa también el widget
// embebido en la web del estudio (con CORS), y no hay por qué contarle a ese
// contexto que la persona es del equipo. Esta no lleva CORS: solo la llama la app.
//
// 404 con `instructora: null` cuando no lo es — también sin token: quien llama
// solo necesita saber «no», y así no hay dos respuestas distintas que comparar.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-sesion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ instructora: null }, { status: 404 });
    return NextResponse.json({
      instructora: { instructorId: sesion.instructorId, nombre: sesion.nombre, fotoUrl: sesion.fotoUrl },
    });
  } catch (err) {
    return errorInterno('portal/instructora/sesion:POST', err, 'No hemos podido comprobar tu acceso.');
  }
}
