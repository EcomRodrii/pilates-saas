import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { hashToken } from '@/lib/token-hash';
import { responderSustitucion } from '@/lib/sustituciones/responder';

// Endpoint PÚBLICO (sin login): la candidata responde al deep link del email.
// 'aceptar' → confirmación atómica (RPC confirmar_sustitucion) + reasigna la clase.
// 'rechazar' → marca el contacto y devuelve la sustitución al panel de la dueña.
//
// La lógica vive en `lib/sustituciones/responder.ts`, compartida con la app del
// estudio: aquí solo se prueba quién contesta (el token) y se traduce a HTTP.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-aceptar-sustitucion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: string; accion?: string } | null;
  const claim = verificarTokenInstructora(body?.token, 'aceptar_sustitucion');
  if (!claim || !claim.ref) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const accion = body?.accion;
  if (accion !== 'aceptar' && accion !== 'rechazar') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  }

  try {
    const r = await responderSustitucion(admin, {
      sustitucionId: claim.ref,
      studioId: claim.studioId,
      instructorId: claim.instructorId,
      accion,
      // La traza guarda solo el hash del token (migr 20260914011337). La firma ya
      // está verificada arriba; el hash solo sirve para encontrar SU contacto.
      contacto: { via: 'enlace', tokenHash: hashToken(String(body?.token)) },
    });
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (err) {
    return errorInterno('public:aceptar-sustitucion', err,
      'No se ha podido registrar tu respuesta. Vuelve a abrir el enlace del email en unos segundos; si sigue fallando, avisa al estudio.');
  }
}
