import { NextRequest, NextResponse } from 'next/server';
import { resolveStudioIdBySlug } from '@/lib/supabase-data';
import { fetchPublicStudioData, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Datos para las páginas públicas (reserva/portal/kiosk): catálogo público del
// estudio + (si hay socia autenticada) SUS datos.
// SEGURIDAD: la identidad de la socia se deriva del JWT de Supabase Auth, NUNCA
// de {socioId,email} del body. Sin token válido se devuelve solo el catálogo
// (clases, salas, planes…), sin ningún dato personal/financiero.
//
// CORS: solo importa cuando llama el bundle embebible desde el dominio del
// estudio (?slug= en la URL además del body) — el iframe existente es
// same-origin y estas cabeceras no le afectan.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-studio-data', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { slug?: string; liviano?: boolean } | null;
  const slug = body?.slug?.trim();
  if (!slug) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el slug del estudio' }, { status: 400 }));
  }
  const liviano = body?.liviano === true;

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
    const data = await fetchPublicStudioData(slug, member, { liviano });
    if (!data) {
      return conCorsWidget(req, NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 }));
    }
    return conCorsWidget(req, NextResponse.json(data));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/studio-data:POST', err, 'No se han podido cargar los datos del estudio.'));
  }
}
