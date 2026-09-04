import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenValoracion } from '@/lib/valoraciones/token';
import { normalizarValoracion } from '@/lib/valoraciones/reglas';
import { guardarValoracion } from '@/lib/valoraciones/guardar';

// Endpoint PÚBLICO (sin login): la alumna envía su valoración desde el deep link.
// Idempotente por (alumna, clase): reenviar el link o cambiar la nota no duplica.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-valorar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { token?: string; puntuacion?: number; comentario?: string | null } | null;

  const claim = verificarTokenValoracion(body?.token);
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const v = normalizarValoracion(body?.puntuacion, body?.comentario);
  if (!v) return NextResponse.json({ error: 'Puntuación no válida' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Misma escritura que la app de la alumna (`/api/public/valorar-clase`).
  const r = await guardarValoracion(admin, { studioId: claim.studioId, sesionId: claim.sesionId, socioId: claim.socioId, ...v });
  if (!r.ok) {
    if (r.status === 500) return errorInterno('public:valorar', r.detalle, r.error);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json(r.actualizada ? { ok: true, actualizada: true } : { ok: true });
}
