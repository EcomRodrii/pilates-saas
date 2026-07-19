import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { isWhatsAppConfigurado, probarWhatsApp } from '@/lib/whatsapp';
import { isPayPalConfigurado, probarPayPal } from '@/lib/paypal';
import { isZoomConfigurado, probarZoom } from '@/lib/zoom';
import { isKisiConfigurado, probarKisi } from '@/lib/kisi';
import { isTwilioConfigurado, probarTwilio } from '@/lib/twilio';

// Estado de las integraciones de plataforma (secretos por ENV del operador). El
// cliente no puede leer envs de servidor, así que las consulta aquí.
// GET  → qué integraciones tienen ENV configurada (no valida credenciales).
// POST → prueba real de conexión de un proveedor { provider }.

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({
    WHATSAPP: isWhatsAppConfigurado(),
    PAYPAL: isPayPalConfigurado(),
    ZOOM: isZoomConfigurado(),
    KISI: isKisiConfigurado(),
    TWILIO: isTwilioConfigurado(),
  });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede probar integraciones' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { provider?: string } | null;
  const provider = body?.provider;
  const r =
    provider === 'WHATSAPP' ? await probarWhatsApp()
    : provider === 'PAYPAL' ? await probarPayPal()
    : provider === 'ZOOM' ? await probarZoom()
    : provider === 'KISI' ? await probarKisi()
    : provider === 'TWILIO' ? await probarTwilio()
    : { ok: false as const, error: 'Proveedor desconocido' };

  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
