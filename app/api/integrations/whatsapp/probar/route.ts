import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { probarWhatsApp } from '@/lib/whatsapp';

// Botón "Probar conexión" de WhatsApp Business en Configuración →
// Integraciones: prueba el token + ID de número que ESE ESTUDIO pegó y
// guardó — no hay secreto de plataforma.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo límite que la RLS de `integraciones` (`owner_integraciones`) y que el
  // resto de endpoints de integraciones: PROPIETARIO. Aquí faltaba, y como se
  // lee la config con el cliente de servicio, la RLS no lo cubría — cualquier
  // miembro del personal podía disparar pruebas contra la cuenta de Meta del
  // estudio.
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede probar las integraciones' }, { status: 403 });
  }

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP');
  const token = intg?.config.token?.trim();
  const phoneId = intg?.config.phoneId?.trim();
  if (!token || !phoneId) return NextResponse.json({ ok: false, error: 'Falta el token o el ID de número de teléfono' }, { status: 400 });

  const r = await probarWhatsApp({ token, phoneId });
  // El botón sirve para saber si funciona: si no deja rastro, la pantalla se
  // olvida en cuanto se recarga. Es además la única forma de sacar a una
  // integración de SIN_PROBAR sin esperar al próximo recordatorio.
  const admin = getSupabaseAdmin();
  if (admin) await registrarSaludIntegracion(admin, sesion.studioId, 'WHATSAPP', r);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
