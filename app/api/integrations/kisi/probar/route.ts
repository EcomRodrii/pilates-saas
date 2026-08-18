import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { probarKisi } from '@/lib/kisi';

// Botón "Probar conexión" de Kisi en Configuración → Integraciones: prueba la
// clave API que ESE ESTUDIO pegó y guardó — no hay secreto de plataforma.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo límite que la RLS de `integraciones` y que el resto de endpoints de
  // integraciones: PROPIETARIO. Faltaba, y la config se lee con el cliente de
  // servicio, así que la RLS no lo cubría.
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede probar las integraciones' }, { status: 403 });
  }

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'KISI');
  const apiKey = intg?.config.apiKey?.trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: 'Falta la clave API de Kisi' }, { status: 400 });

  const r = await probarKisi({ apiKey });
  const admin = getSupabaseAdmin();
  if (admin) await registrarSaludIntegracion(admin, sesion.studioId, 'KISI', r);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
