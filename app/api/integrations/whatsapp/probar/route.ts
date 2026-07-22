import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetIntegracionConfig } from '@/lib/supabase-data';
import { probarWhatsApp } from '@/lib/whatsapp';

// Botón "Probar conexión" de WhatsApp Business en Configuración →
// Integraciones: prueba el token + ID de número que ESE ESTUDIO pegó y
// guardó — no hay secreto de plataforma.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'WHATSAPP');
  const token = intg?.config.token?.trim();
  const phoneId = intg?.config.phoneId?.trim();
  if (!token || !phoneId) return NextResponse.json({ ok: false, error: 'Falta el token o el ID de número de teléfono' }, { status: 400 });

  const r = await probarWhatsApp({ token, phoneId });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
