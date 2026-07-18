import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uid } from '@/lib/utils';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { FRANJAS, celdaKey, parseCeldaKey, franjaPorHoraInicio } from '@/lib/sustituciones/franjas';

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

  const { data: instructora } = await admin
    .from('instructores')
    .select('nombre, studio_id')
    .eq('id', claim.instructorId)
    .eq('studio_id', claim.studioId)
    .maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const { data: estudio } = await admin
    .from('studios').select('nombre').eq('id', claim.studioId).maybeSingle();

  const { data: filas } = await admin
    .from('instructora_disponibilidad')
    .select('dia_semana, hora_inicio')
    .eq('instructor_id', claim.instructorId);

  const celdas = (filas ?? [])
    .map((f) => {
      const franja = franjaPorHoraInicio(String(f.hora_inicio));
      return franja ? celdaKey(f.dia_semana as number, franja) : null;
    })
    .filter((c): c is string => c !== null);

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

  // Comprobación defensiva: la instructora del token pertenece a ese estudio.
  const { data: instructora } = await admin
    .from('instructores').select('id')
    .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  // Parsea y deduplica las celdas válidas.
  const brutas = Array.isArray(body?.celdas) ? (body!.celdas as unknown[]) : [];
  const validas = new Map<string, { dow: number; franja: string }>();
  for (const c of brutas) {
    if (typeof c !== 'string') continue;
    const parsed = parseCeldaKey(c);
    if (parsed) validas.set(c, parsed);
  }

  const filas = Array.from(validas.values()).map(({ dow, franja }) => {
    const f = FRANJAS.find((x) => x.key === franja)!;
    return {
      id: `disp-${uid()}`,
      studio_id: claim.studioId,
      instructor_id: claim.instructorId,
      dia_semana: dow,
      hora_inicio: f.horaInicio,
      hora_fin: f.horaFin,
    };
  });

  // Reemplazo completo: borra lo anterior de ESTA instructora e inserta lo nuevo.
  const del = await admin
    .from('instructora_disponibilidad').delete().eq('instructor_id', claim.instructorId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });

  if (filas.length > 0) {
    const ins = await admin.from('instructora_disponibilidad').insert(filas);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, guardadas: filas.length });
}
