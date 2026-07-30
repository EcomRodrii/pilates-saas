import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado } from '@/lib/sustituciones/enlaces';
import { leerDisponibilidad, guardarDisponibilidad } from '@/lib/sustituciones/disponibilidad';

// Endpoint PÚBLICO (sin login): la instructora llega por deep link firmado y
// gestiona SU disponibilidad. El token ES la autorización (scope 'disponibilidad',
// ligado a instructorId+studioId). Escritura con service-role, pero SIEMPRE
// acotada al instructor_id que viaja firmado en el token → una instructora solo
// puede tocar sus propias filas.

// GET ?token=... → datos para pintar la rejilla (nombre, estudio, celdas activas)
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-disponibilidad-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token');
  const claim = verificarTokenInstructora(token, 'disponibilidad');
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Un enlace nuevo generado para esta instructora revoca este (migración 0057).
  if (await enlaceRevocado(admin, claim.instructorId, 'disponibilidad', token!)) {
    return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });
  }

  const { data: instructora } = await admin
    .from('instructores')
    .select('nombre, studio_id')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const { data: estudio } = await admin
    .from('studios').select('nombre').eq('id', claim.studioId).maybeSingle();

  const celdas = await leerDisponibilidad(admin, claim.instructorId);

  return NextResponse.json({
    instructorNombre: instructora.nombre,
    estudioNombre: estudio?.nombre ?? '',
    celdas,
  });
}

// POST { token, celdas: string[] } → reemplaza la disponibilidad de la instructora
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-disponibilidad-save', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: string; celdas?: unknown } | null;
  const claim = verificarTokenInstructora(body?.token, 'disponibilidad');
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (await enlaceRevocado(admin, claim.instructorId, 'disponibilidad', body!.token!)) {
    return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });
  }

  // Comprobación defensiva: la instructora del token pertenece a ese estudio.
  const { data: instructora } = await admin
    .from('instructores').select('id')
    .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const r = await guardarDisponibilidad(admin, {
    studioId: claim.studioId, instructorId: claim.instructorId, celdasRaw: body?.celdas,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ ok: true, guardadas: r.guardadas });
}
