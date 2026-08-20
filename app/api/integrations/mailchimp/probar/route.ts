import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { probarMailchimp } from '@/lib/mailchimp';

// Botón "Probar conexión" de Mailchimp en Configuración → Integraciones:
// prueba la clave API que ESE ESTUDIO pegó y guardó — no hay secreto de
// plataforma. Mismo patrón que app/api/integrations/kisi/probar/route.ts.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede probar las integraciones' }, { status: 403 });
  }

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'MAILCHIMP');
  const apiKey = intg?.config.apiKey?.trim();
  const audienceId = intg?.config.audienceId?.trim();
  const serverPrefix = intg?.config.serverPrefix?.trim();
  if (!apiKey || !audienceId || !serverPrefix) {
    return NextResponse.json({ ok: false, error: 'Faltan datos de Mailchimp (clave API, ID de audiencia o prefijo de servidor)' }, { status: 400 });
  }

  const r = await probarMailchimp({ apiKey, audienceId, serverPrefix });
  const admin = getSupabaseAdmin();
  if (admin) await registrarSaludIntegracion(admin, sesion.studioId, 'MAILCHIMP', r);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
