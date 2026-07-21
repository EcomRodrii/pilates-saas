import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicStudioData, resolveStudioIdBySlug, socioAutenticado } from '@/lib/supabase-data';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Datos para las páginas públicas (reserva/portal/kiosk): catálogo público del
// estudio + (si hay socia autenticada) SUS datos.
// SEGURIDAD: la identidad de la socia se deriva del JWT de Supabase Auth, NUNCA
// de {socioId,email} del body. Sin token válido se devuelve solo el catálogo
// (clases, salas, planes…), sin ningún dato personal/financiero.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-studio-data', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { slug?: string } | null;
  const slug = body?.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'Falta el slug del estudio' }, { status: 400 });
  }

  let member: { socioId: string; email: string } | undefined;
  const user = await verificarUsuarioSupabase(req);
  if (user) {
    const studioId = await resolveStudioIdBySlug(slug);
    if (studioId) {
      const socioId = await socioAutenticado(user.userId, studioId);
      if (socioId) member = { socioId, email: user.email };
    }
  }

  try {
    const data = await fetchPublicStudioData(slug, member);
    if (!data) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return errorInterno('public/studio-data:POST', err, 'No se han podido cargar los datos del estudio.');
  }
}
