import { NextRequest, NextResponse } from 'next/server';
import { fichaInstructoraPendiente, verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug } from '@/lib/db/supabase-data-admin';
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
//
// `invitacionPendiente` (15-sep-2026): en ese «no», si el estudio la tiene dada
// de alta como instructora con su correo y aún no ha entrado. La app le deja
// entonces elegir entre instructora y alumna. Sale del correo del TOKEN, así que
// solo se le dice a la dueña de ese correo; sin token, siempre `false`.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-sesion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) {
      return NextResponse.json(
        { instructora: null, invitacionPendiente: await hayInvitacionPendiente(req, body.slug) },
        { status: 404 },
      );
    }
    return NextResponse.json({
      instructora: { instructorId: sesion.instructorId, nombre: sesion.nombre, fotoUrl: sesion.fotoUrl },
    });
  } catch (err) {
    return errorInterno('portal/instructora/sesion:POST', err, 'No hemos podido comprobar tu acceso.');
  }
}

async function hayInvitacionPendiente(req: NextRequest, slug: string): Promise<boolean> {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return false;
  return (await fichaInstructoraPendiente(admin, usuario.email, (resuelto.row as { id: string }).id)) !== null;
}
