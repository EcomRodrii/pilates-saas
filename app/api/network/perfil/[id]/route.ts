import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { obtenerPerfilPublicoPorId } from '@/lib/network/publico';

// Detalle de un perfil de Network, visto desde el PANEL de un estudio (tras
// un resultado del buscador) — docs/NETWORK-IMPLEMENTATION-PLAN.md §4/§8.
// Mismo dato público que el marketplace indexable
// (app/network/instructoras/[slug], sin sesión) — solo cambia el guard de
// arriba, no las columnas que se leen (lib/network/publico.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const detalle = await obtenerPerfilPublicoPorId(admin, id);
  if (detalle && 'error' in detalle) return errorInterno('network:perfil:detalle', detalle.error, 'No se ha podido cargar este perfil.');
  if (!detalle) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });

  return NextResponse.json(detalle);
}
