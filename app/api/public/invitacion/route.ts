import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';

// Resuelve un enlace de invitación. PÚBLICO y sin sesión a propósito: la persona
// invitada todavía NO tiene cuenta — ese es justo el problema que resuelve.
//
// Devuelve lo justo para pintar la pantalla: nombre del estudio, a quién va
// dirigida y con qué email debe registrarse. Nada más — el token identifica a
// UNA instructora concreta, así que no sirve para enumerar el equipo.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-invitacion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const claim = verificarTokenInstructora(req.nextUrl.searchParams.get('token'), 'invitacion');
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [{ data: instructor }, { data: studio }] = await Promise.all([
    admin.from('instructores').select('nombre, email, auth_user_id, activo')
      .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle(),
    admin.from('studios').select('nombre, logo_url').eq('id', claim.studioId).maybeSingle(),
  ]);

  if (!instructor || instructor.activo === false) {
    return NextResponse.json({ error: 'Esta invitación ya no está disponible.' }, { status: 404 });
  }
  // Ya se registró: decirlo evita que repita el alta y acabe con una cuenta
  // suelta creada con otro correo, que es el fallo silencioso de este flujo.
  if (instructor.auth_user_id) {
    return NextResponse.json({ yaVinculada: true, estudio: studio?.nombre ?? 'tu estudio' });
  }

  return NextResponse.json({
    yaVinculada: false,
    nombre: instructor.nombre as string,
    email: instructor.email as string | null,
    estudio: (studio?.nombre as string | null) ?? 'tu estudio',
  });
}
