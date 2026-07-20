import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { firmarTokenInstructora, type ScopeToken } from '@/lib/sustituciones/token';

// Genera un deep link firmado que la propietaria envía a una instructora para
// que haga algo sin login. Solo la propietaria del estudio.
// El enlace no expone datos: es {payload firmado}.hmac, válido 30 días.
//
//   disponibilidad → rellenar cuándo puede cubrir clases
//   reportar_baja  → avisar de que no puede dar una de SUS clases
//
// Scopes separados a propósito: un enlace que solo edita su horario no debe
// poder además desconvocar clases (mínimo privilegio), aunque sea la misma
// persona quien lo recibe.
const RUTA_POR_SCOPE: Record<'disponibilidad' | 'reportar_baja', string> = {
  disponibilidad: 'disponibilidad',
  reportar_baja: 'no-puedo',
};

function esScopeValido(v: unknown): v is keyof typeof RUTA_POR_SCOPE {
  return v === 'disponibilidad' || v === 'reportar_baja';
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede generar enlaces' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { instructorId?: string; scope?: unknown } | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  if (!instructorId) return NextResponse.json({ error: 'Falta instructorId' }, { status: 400 });

  // Sin scope explícito → disponibilidad (comportamiento previo de esta ruta).
  const scope = body?.scope === undefined ? 'disponibilidad' : body.scope;
  if (!esScopeValido(scope)) return NextResponse.json({ error: 'Scope no válido' }, { status: 400 });

  // La instructora debe pertenecer al estudio de quien pide el enlace.
  const { data: instructora } = await admin
    .from('instructores').select('id, nombre')
    .eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const token = firmarTokenInstructora(instructorId, sesion.studioId, scope as ScopeToken);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const url = `${appUrl}/${RUTA_POR_SCOPE[scope]}/${token}`;

  return NextResponse.json({ url, instructorNombre: instructora.nombre });
}
