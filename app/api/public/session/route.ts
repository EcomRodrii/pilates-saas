import { NextRequest, NextResponse } from 'next/server';
import { usuarioSupabaseConPaso } from '@/lib/auth-server';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
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

  const r = await usuarioSupabaseConPaso(req);
  if (!r) {
    return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));
  }
  // Sesión buena, pero tiene la verificación en dos pasos activada y aún no la
  // ha pasado: un código propio, para que la app la mande a verificar y no a
  // entrar otra vez (lib/student/doble-factor-portal.ts).
  if (r.paso === 'doble_factor') {
    return conCorsWidget(req, NextResponse.json(
      { error: 'Falta el segundo paso de la verificación', codigo: CODIGO_SEGUNDO_PASO }, { status: 401 },
    ));
  }
  const user = r.usuario;

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
