import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowSocioCompaneras } from '@/lib/db-types';

// Acepta una solicitud pendiente. Solo la destinataria de ESA fila concreta
// (resuelta desde la sesión, nunca del body) puede aceptar — igual que
// aceptar/rechazar una oferta de lista de espera, la identidad de quien actúa
// nunca viaja en el payload.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'public-social-companeras-aceptar', { max: 30, windowSeconds: 60 });
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

  if (!relacion || relacion.destinataria_id !== socioId) {
    // Mismo mensaje para "no existe" y "no es tuya" — no confirmar de una
    // solicitud ajena que existe.
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (relacion.estado !== 'pendiente') {
    return errorPeticion('Esta solicitud ya no está pendiente.', 409, { estado: relacion.estado });
  }

  const { error } = await admin
    .from('socio_companeras')
    .update({ estado: 'aceptada', resuelto_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return errorInterno('public/social/companeras/aceptar:POST', error, 'No se ha podido aceptar la solicitud.');

  return NextResponse.json({ id, estado: 'aceptada' });
}
