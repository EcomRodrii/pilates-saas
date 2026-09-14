import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { ofertasDeInstructora } from '@/lib/portal-instructora/ofertas-servidor';
import { responderSustitucion } from '@/lib/sustituciones/responder';
import { textoMotivoOferta } from '@/lib/student/agenda-instructora';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// «Te piden cubrir esta clase» en la app del estudio: lo que el motor le está
// preguntando y su respuesta, «la cubro» o «no puedo».
//
// Contestar pasa por `responderSustitucion`, el mismo núcleo que el enlace del
// email: confirmación atómica, avance al siguiente del ranking y aviso a la
// propietaria. Cambia qué prueba que se le preguntó: allí el token; aquí ser la
// candidata vigente (`via: 'app'`).
//
// La instructora y el estudio salen del token + slug; del body solo la acción y
// la sustitución.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-ofertas', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: string; accion?: unknown; sustitucionId?: unknown } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion;
  if (accion !== 'listar' && accion !== 'aceptar' && accion !== 'rechazar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }
  const sustitucionId = typeof body.sustitucionId === 'string' ? body.sustitucionId : null;
  if (accion !== 'listar' && !sustitucionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    if (accion === 'listar') {
      const ofertas = await ofertasDeInstructora({ studioId: sesion.studioId, instructorId: sesion.instructorId });
      return NextResponse.json({ ofertas });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const r = await responderSustitucion(admin, {
      sustitucionId: sustitucionId as string,
      studioId: sesion.studioId,
      instructorId: sesion.instructorId,
      accion,
      contacto: { via: 'app' },
    });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, motivo: r.motivo, error: textoMotivoOferta(r.motivo) },
        { status: r.motivo === 'no_encontrada' ? 404 : 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('portal/instructora/ofertas:POST', err,
      'No hemos podido registrar tu respuesta. Vuelve a intentarlo en unos segundos.');
  }
}
