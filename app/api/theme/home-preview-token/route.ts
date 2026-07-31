import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { firmarTokenPreviewHome } from '@/lib/theme/home-preview-token';

// Emite el token de /portal-preview/[slug] (Fase 4 del editor de temas) para
// el estudio de quien pide — gateado igual que app/api/plantillas-email/preview.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json({ token: firmarTokenPreviewHome(sesion.studioId) });
}
