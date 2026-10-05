import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { asistenteEncendido, leerSaldo } from '@/lib/asistente/servidor';

// GET /api/asistente/saldo — «Te quedan N consultas este mes». La cifra la
// calcula `ia_saldo_consultas` (la única dueña del saldo, en SQL); esto solo la
// pasa. Del estudio de la sesión, nunca de un parámetro.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeUsarAsistente(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  if (!asistenteEncendido()) return NextResponse.json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, { status: 404 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const saldo = await leerSaldo(admin, { studioId: sesion.studioId, userId: sesion.userId, rol: sesion.rol });
  if (!saldo) return NextResponse.json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, { status: 503 });
  return NextResponse.json(saldo, { headers: { 'Cache-Control': 'no-store' } });
}
