import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { revocarCertificado } from '@/lib/certificados/certificados';

export const dynamic = 'force-dynamic';

// Revoca el certificado ACTIVO del estudio de la sesión. `codigo` en la URL
// es solo para que el enlace sea legible/auditable en los logs — la revocación
// SIEMPRE actúa sobre el certificado del studio_id de la sesión, nunca sobre
// el código que venga en la URL: así un estudio no puede revocar el de otro
// aunque adivine su código.
export async function POST(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { codigo } = await params;
  const r = await revocarCertificado(sesion.studioId);
  if (r && 'error' in r) return NextResponse.json({ error: r.error }, { status: 500 });
  if (!r || r.codigo !== codigo) {
    return NextResponse.json({ error: 'Ese certificado ya no está activo' }, { status: 409 });
  }
  return NextResponse.json({ certificado: r });
}
