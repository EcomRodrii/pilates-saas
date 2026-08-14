import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeGestionarAppsOAuth } from '@/lib/permisos-reglas';

// Lista de apps de terceros conectadas al estudio — pantalla "Apps
// conectadas" (Fase 4). Solo consentimientos ACTIVOS (revocado_en IS NULL).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'oauth-consentimientos', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!puedeGestionarAppsOAuth(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data } = await admin
    .from('oauth_consentimientos')
    .select('cliente_id, scopes, otorgado_en, oauth_clientes(nombre, descripcion, logo_url)')
    .eq('studio_id', sesion.studioId)
    .is('revocado_en', null)
    .order('otorgado_en', { ascending: false });

  const apps = (data ?? []).map(c => {
    const cliente = Array.isArray(c.oauth_clientes) ? c.oauth_clientes[0] : c.oauth_clientes;
    return {
      clienteId: c.cliente_id,
      nombre: cliente?.nombre ?? c.cliente_id,
      descripcion: cliente?.descripcion ?? null,
      logoUrl: cliente?.logo_url ?? null,
      scopes: c.scopes as string[],
      otorgadoEn: c.otorgado_en as string,
    };
  });

  return NextResponse.json({ apps });
}
