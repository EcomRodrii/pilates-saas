import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { probarZoom } from '@/lib/zoom';

// Botón "Probar conexión" de Zoom en Configuración → Integraciones: prueba la
// cuenta de Zoom QUE ESE ESTUDIO conectó (no hay secreto de plataforma).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Auditoría 2026-09-16 (AUTH-2): mismo gate que zoom/disconnect. Consume la
  // API de Zoom del estudio.
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede probar integraciones' }, { status: 403 });
  }

  const r = await probarZoom(sesion.studioId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
