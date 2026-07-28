import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { billingEnforced, bloqueoPorLimiteSocias } from '@/lib/billing/billing-guard';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';

// Guarda del tope de socias del plan para el alta MANUAL (una a una), llamada
// antes del insert directo desde el cliente en `addSocio`. El alta masiva por
// CSV (app/api/socios/import) ya comprobaba esto — el alta manual la saltaba
// por completo (el insert es directo a Supabase desde el navegador, sin pasar
// por ninguna ruta con autoridad de servidor), así que un estudio en el tope
// podía seguir dando de alta socias una a una sin límite.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para dar de alta clientas' }, { status: 403 });
  }

  if (!billingEnforced()) return NextResponse.json({ ok: true });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true }); // sin service-role, fail-open como el resto de guardas

  const { count: activasActuales } = await admin
    .from('socios')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', sesion.studioId)
    .eq('activo', true)
    .is('borrado_en', null);

  const bloqueo = await bloqueoPorLimiteSocias(sesion.studioId, activasActuales ?? 0, 1);
  if (bloqueo) return bloqueo;

  return NextResponse.json({ ok: true });
}
