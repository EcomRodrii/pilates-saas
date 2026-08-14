import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { resolverSociaAutenticada } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';

// Resuelve la sesión de una socia del portal a partir de su JWT de Supabase Auth
// (obtenido con magic link / OTP en el cliente). Sustituye a /api/public/login,
// que solo comprobaba que el email existiera —sin ninguna prueba de control—.
// Aquí el usuario ya demostró que controla el email al autenticarse con
// Supabase; este endpoint vincula (claim) su fila de socia y devuelve su perfil.
//
// CORS: el bundle embebible (lib/widget/usar-sesion-widget.ts) lo llama para
// bootstrar una sesión YA existente (visitante que volvió tras loguearse en
// /reservar) — manda ?slug= en la URL para que el preflight pueda resolver.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-session', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { slug?: string } | null;
  if (!body?.slug) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) {
    return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));
  }

  try {
    const socia = await resolverSociaAutenticada(body.slug, user.userId, user.email);
    if (!socia) {
      // Autenticada, pero su email no corresponde a ninguna socia de este
      // estudio (o ya está vinculada a otro usuario).
      return conCorsWidget(req, NextResponse.json({ error: 'No hay ninguna socia con este email en el estudio' }, { status: 404 }));
    }
    return conCorsWidget(req, NextResponse.json(socia));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/session:POST', err, 'No se ha podido iniciar sesión.'));
  }
}
