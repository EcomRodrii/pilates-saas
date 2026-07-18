import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';

// Estados que se consideran "activos" (una baja en curso). Coincide con el índice
// único parcial `uq_sustitucion_activa_por_sesion` de la migración 0037.
const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

// POST /api/sustituciones — marcar una baja: "no puedo dar esta clase".
// Crea la sustitución (idempotente), calcula el ranking de candidatas con
// motivos humanos y la deja lista según el modo de autonomía del estudio.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sesionId?: string; motivo?: string } | null;
  const sesionId = typeof body?.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase (sesionId)' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim().slice(0, 500) || null : null;

  // La clase debe existir y ser de este estudio.
  const { data: clase } = await admin
    .from('sesiones').select('id, studio_id, instructor_id, cancelada')
    .eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!clase) return NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 });
  if (clase.cancelada) return NextResponse.json({ error: 'La clase ya está cancelada' }, { status: 409 });

  // Idempotencia (rápida): si ya hay una sustitución activa para esta clase, la devuelve.
  const { data: existente } = await admin
    .from('sustituciones').select('*')
    .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
  if (existente) return NextResponse.json({ sustitucion: existente, yaExistia: true });

  // Modo de autonomía del estudio (0039).
  const { data: estudio } = await admin
    .from('studios').select('modo_autonomia').eq('id', sesion.studioId).maybeSingle();
  const modo = (estudio?.modo_autonomia as string) ?? 'asistido';

  // Scoring: top-3 de candidatas con motivos en lenguaje humano (función 0038).
  const { data: ranking, error: errRank } = await admin.rpc('rankear_candidatas', { p_sesion_id: sesionId });
  if (errRank) return NextResponse.json({ error: errRank.message }, { status: 500 });

  // manual/asistido → espera aprobación de la propietaria; autonomo/vacaciones →
  // pasa a contactar (el cron de contacto es la fase siguiente).
  const estado = modo === 'autonomo' || modo === 'vacaciones' ? 'contactando' : 'pendiente_aprobacion';

  const nueva = {
    id: `sust-${uid()}`,
    studio_id: sesion.studioId,
    sesion_id: sesionId,
    instructor_original_id: clase.instructor_id,
    motivo,
    estado,
    ranking: ranking ?? [],
    candidata_actual: 0,
  };

  const { data: insertada, error: errIns } = await admin
    .from('sustituciones').insert(nueva).select('*').single();

  if (errIns) {
    // Choque con el índice único parcial (dos bajas simultáneas de la misma
    // clase) → gana la primera; devolvemos la activa en vez de crear otra.
    if (errIns.code === '23505') {
      const { data: activa } = await admin
        .from('sustituciones').select('*')
        .eq('sesion_id', sesionId).not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle();
      if (activa) return NextResponse.json({ sustitucion: activa, yaExistia: true });
    }
    return NextResponse.json({ error: errIns.message }, { status: 500 });
  }

  return NextResponse.json({ sustitucion: insertada, yaExistia: false });
}
