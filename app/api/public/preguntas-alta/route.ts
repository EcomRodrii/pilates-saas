import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { leerPreguntasAlta, guardarRespuestasAlta } from '@/lib/db/preguntas-alta-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Las preguntas de «Datos extra de la ficha» que contesta la propia alumna en su
// app, cuando el estudio tiene encendido «Preguntar los datos extra en su app».
//
// SEGURIDAD: sesión real (JWT) y la socia sale de ese token cruzado con el
// estudio (`socioAutenticado`), NUNCA del cuerpo. Solo se escriben respuestas a
// preguntas activas del estudio (`validarRespuestas`); cualquier otra clave del
// cuerpo se ignora.

export const dynamic = 'force-dynamic';

async function resolver(req: NextRequest, studioId: string) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return null;
  return socioAutenticado(user.userId, studioId);
}

export async function GET(req: NextRequest) {
  // La app lo pide al abrirse; holgado.
  const limited = await enforceRateLimit(req, 'public-preguntas-alta-leer', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const studioId = req.nextUrl.searchParams.get('studioId') ?? '';
  if (!studioId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  const socioId = await resolver(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    return NextResponse.json(await leerPreguntasAlta(admin, studioId, socioId));
  } catch (err) {
    return errorInterno('public/preguntas-alta:GET', err, 'No hemos podido cargar las preguntas.');
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-preguntas-alta', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; respuestas?: unknown } | null;
  const studioId = body?.studioId ?? '';
  const respuestas = body?.respuestas;
  if (!studioId || !respuestas || typeof respuestas !== 'object' || Array.isArray(respuestas)) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }
  const socioId = await resolver(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const r = await guardarRespuestasAlta(admin, studioId, socioId, respuestas as Record<string, unknown>);
    if (!r.ok) return NextResponse.json({ error: r.error, errores: r.errores }, { status: r.status });
    return NextResponse.json(r.estado);
  } catch (err) {
    return errorInterno('public/preguntas-alta:POST', err, 'No hemos podido guardar tus respuestas. Inténtalo de nuevo.');
  }
}
