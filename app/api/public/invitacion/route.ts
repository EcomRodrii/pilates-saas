import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado } from '@/lib/sustituciones/enlaces';
import { respuestaInvitacionPublica, type FichaInvitada } from '@/lib/equipo/invitacion-publica';

// Resuelve un enlace de invitación. PÚBLICO y sin sesión a propósito: la persona
// invitada todavía NO tiene cuenta — ese es justo el problema que resuelve.
//
// Lo que devuelve, y por qué el correo va tapado, en
// `lib/equipo/invitacion-publica.ts`. El token identifica a UNA persona
// concreta, así que no sirve para enumerar el equipo.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-invitacion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token');
  const claim = verificarTokenInstructora(token, 'invitacion');
  if (!token || !claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [{ data: instructor }, { data: studio }] = await Promise.all([
    admin.from('instructores').select('nombre, email, auth_user_id, activo, rol')
      .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle(),
    admin.from('studios').select('nombre, slug').eq('id', claim.studioId).maybeSingle(),
  ]);

  const ficha = (instructor as FichaInvitada | null) ?? null;
  const pendiente = !!ficha && ficha.activo !== false && !ficha.auth_user_id;
  const revocado = pendiente && await enlaceRevocado(admin, claim.instructorId, 'invitacion', token);

  const { status, body } = respuestaInvitacionPublica(
    ficha,
    studio ? { nombre: (studio.nombre as string | null) ?? null, slug: (studio.slug as string | null) ?? null } : null,
    revocado,
  );
  return NextResponse.json(body, { status });
}
