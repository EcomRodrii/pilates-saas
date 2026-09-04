import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarValoracion, puedeValorarReserva } from '@/lib/valoraciones/reglas';
import { guardarValoracion } from '@/lib/valoraciones/guardar';

// Valorar una clase DESDE LA APP de la alumna (la otra puerta es el deep link
// del email, `/api/public/valorar`, con token firmado).
//
// SEGURIDAD: mismo patrón que /api/public/reserva — sesión real (JWT de
// Supabase Auth), y el socioId sale del token verificado, nunca del body.
//
// REGLA: solo se valora una clase a la que se ha ASISTIDO (`reservas.estado`).
// Se decide aquí, no en la pantalla.

export const dynamic = 'force-dynamic';

async function socia(req: NextRequest, studioId: string) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return null;
  return socioAutenticado(user.userId, studioId);
}

/** ¿Puede valorar esta clase, y qué puso si ya lo hizo? */
export async function GET(req: NextRequest) {
  const studioId = req.nextUrl.searchParams.get('studioId') ?? '';
  const sesionId = req.nextUrl.searchParams.get('sesionId') ?? '';
  if (!studioId || !sesionId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const socioId = await socia(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [{ data: res }, { data: val }] = await Promise.all([
    admin.from('reservas').select('estado').eq('studio_id', studioId).eq('sesion_id', sesionId).eq('socio_id', socioId)
      .order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    admin.from('valoraciones').select('puntuacion, comentario').eq('studio_id', studioId).eq('sesion_id', sesionId).eq('socio_id', socioId).maybeSingle(),
  ]);
  const puede = puedeValorarReserva(res?.estado);
  return NextResponse.json({
    puedeValorar: puede.ok,
    motivo: puede.ok ? null : puede.motivo,
    valoracion: val ? { puntuacion: val.puntuacion, comentario: val.comentario ?? null } : null,
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-valorar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { studioId?: string; sesionId?: string; puntuacion?: number; comentario?: string | null } | null;
  if (!body?.studioId || !body?.sesionId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  const v = normalizarValoracion(body.puntuacion, body.comentario);
  if (!v) return NextResponse.json({ error: 'Puntuación no válida' }, { status: 400 });

  const socioId = await socia(req, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: res } = await admin.from('reservas').select('estado')
    .eq('studio_id', body.studioId).eq('sesion_id', body.sesionId).eq('socio_id', socioId)
    .order('creado_en', { ascending: false }).limit(1).maybeSingle();
  const puede = puedeValorarReserva(res?.estado);
  if (!puede.ok) {
    return NextResponse.json({
      error: puede.motivo === 'sin-reserva' ? 'No tienes reserva en esta clase.' : 'Solo puedes valorar una clase a la que hayas asistido.',
      motivo: puede.motivo,
    }, { status: 403 });
  }

  try {
    const r = await guardarValoracion(admin, { studioId: body.studioId, sesionId: body.sesionId, socioId, ...v });
    if (!r.ok) {
      if (r.status === 500) return errorInterno('public/valorar-clase:POST', r.detalle, r.error);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, actualizada: r.actualizada });
  } catch (err) {
    return errorInterno('public/valorar-clase:POST', err, 'No se ha podido guardar tu valoración.');
  }
}
