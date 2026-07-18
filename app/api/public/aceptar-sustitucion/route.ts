import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';

// Endpoint PÚBLICO (sin login): la candidata responde al deep link del email.
// 'aceptar' → confirmación atómica (RPC confirmar_sustitucion) + reasigna la clase.
// 'rechazar' → marca el contacto y devuelve la sustitución al panel de la dueña.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-aceptar-sustitucion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: string; accion?: string } | null;
  const claim = verificarTokenInstructora(body?.token, 'aceptar_sustitucion');
  if (!claim || !claim.ref) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sustitucionId = claim.ref;

  if (body?.accion === 'aceptar') {
    const { data, error } = await admin.rpc('confirmar_sustitucion', {
      p_sustitucion_id: sustitucionId,
      p_instructor_id: claim.instructorId,
      p_studio_id: claim.studioId,
      p_aprobada_por: null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
    if (!r.ok) {
      // Otra persona la cubrió antes (o se canceló): el token llega tarde.
      return NextResponse.json({ ok: false, motivo: 'ya_resuelta' }, { status: 409 });
    }
    // Marca este contacto como aceptado.
    await admin.from('sustitucion_contactos')
      .update({ estado: 'aceptado', respondido_en: new Date().toISOString() })
      .eq('token', body?.token ?? '');

    // Avisa a las alumnas (si el estudio lo tiene activado): "tu clase sigue en pie".
    if (r.sesion_id) {
      const { data: cand } = await admin.from('instructores').select('nombre').eq('id', claim.instructorId).maybeSingle();
      await avisarAlumnas(admin, { sesionId: r.sesion_id, studioId: claim.studioId, tipo: 'cubierta', sustituta: cand?.nombre });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.accion === 'rechazar') {
    await admin.from('sustitucion_contactos')
      .update({ estado: 'rechazado', respondido_en: new Date().toISOString() })
      .eq('token', body?.token ?? '');
    // Devuelve la sustitución al panel para que la dueña elija a otra.
    await admin.from('sustituciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', sustitucionId).eq('studio_id', claim.studioId).eq('estado', 'contactando');
    return NextResponse.json({ ok: true, rechazado: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
