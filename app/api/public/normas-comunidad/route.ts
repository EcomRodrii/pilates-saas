import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { VERSION_NORMAS, versionValida } from '@/lib/moderacion/normas';
import { aceptarNormas, normasAceptadas } from '@/lib/moderacion/normas-servidor';

// Normas de la comunidad de la app (App Store 1.2): se aceptan UNA vez por
// cuenta y versión antes de escribir en el chat o en el tablón. Las comprueban
// las rutas que publican (`antesDePublicar`, lib/moderacion/normas-servidor.ts);
// aquí solo se consultan y se aceptan.
//
// Es de la CUENTA, no de un estudio: la misma persona puede ser alumna y
// instructora, o de varios estudios, y las normas son las mismas. Por eso no
// pide estudio: le basta la sesión de Supabase (la de la alumna o la de la
// instructora, con su segundo paso si lo tiene).

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return NextResponse.json(
      { version: VERSION_NORMAS, aceptadas: await normasAceptadas(admin, user.userId) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorInterno('public/normas-comunidad:GET', e, 'No se han podido cargar las normas.');
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-normas-comunidad', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => null) as { version?: unknown } | null;
  // Se acepta la versión que se ha LEÍDO: si cambiaron mientras tanto, a leerlas otra vez.
  if (!versionValida(body?.version)) {
    return NextResponse.json({ error: 'Las normas han cambiado. Vuelve a leerlas.', version: VERSION_NORMAS }, { status: 409 });
  }
  try {
    await aceptarNormas(admin, user.userId);
    return NextResponse.json({ version: VERSION_NORMAS, aceptadas: true });
  } catch (e) {
    return errorInterno('public/normas-comunidad:POST', e, 'No se han podido guardar. Inténtalo otra vez.');
  }
}
