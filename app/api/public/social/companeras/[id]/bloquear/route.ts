import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowSocioCompaneras } from '@/lib/db-types';

// Bloquea una relación (pendiente o ya aceptada). Cualquiera de las dos
// partes puede bloquear en cualquier momento. `bloqueada_por` registra quién
// de las dos lo hizo — NUNCA se tocan `solicitante_id`/`destinataria_id`
// (esos describen quién envió la solicitud original, son fijos desde el
// alta). Así el listado (`GET /companeras`) distingue "bloqueé yo" (visible,
// por si algún día se construye desbloquear) de "me bloquearon" (invisible
// por completo) sin reescribir el par original.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-social-companeras-bloquear', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string } | null;
  if (!body?.studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: fila } = await admin
    .from('socio_companeras')
    .select('*')
    .eq('id', id)
    .eq('studio_id', body.studioId)
    .maybeSingle();
  const relacion = fila as RowSocioCompaneras | null;

  if (!relacion || (relacion.solicitante_id !== socioId && relacion.destinataria_id !== socioId)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { error } = await admin
    .from('socio_companeras')
    .update({
      estado: 'bloqueada',
      bloqueada_por: socioId,
      resuelto_en: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return errorInterno('public/social/companeras/bloquear:POST', error, 'No se ha podido bloquear.');

  return NextResponse.json({ id, estado: 'bloqueada' });
}
