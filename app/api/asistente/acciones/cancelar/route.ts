import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { asistenteEncendido } from '@/lib/asistente/servidor';
import { cancelarAccion } from '@/lib/asistente/acciones/ejecutar';

// POST /api/asistente/acciones/cancelar — «Cancelar» y «Cambiar algo»: la
// propuesta ya no se puede confirmar (ni desde otra pestaña). Solo la de quien la
// recibió; no llama al modelo.

export const runtime = 'nodejs';
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return json({ error: 'No autorizado' }, 401);
  if (!puedeUsarAsistente(sesionStaff.rol)) return json({ error: 'No tienes permiso para esto', codigo: 'SIN_PERMISO' }, 403);
  if (!asistenteEncendido(sesionStaff.studioId)) return json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, 404);
  const [rafaga, body] = await Promise.all([
    enforceRateLimit(req, 'asistente-cancelar', { max: 30, windowSeconds: 60 }, sesionStaff.userId),
    req.json().catch(() => null),
  ]);
  if (rafaga) return rafaga;
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !UUID.test(id)) return json({ error: 'Propuesta no válida' }, 400);
  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: 'Servidor no configurado' }, 503);
  const r = await cancelarAccion(admin, { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol, nombre: sesionStaff.nombre }, id, new Date());
  return r.ok ? json({ estado: r.estado }, 200) : json({ error: r.error }, r.status);
}
