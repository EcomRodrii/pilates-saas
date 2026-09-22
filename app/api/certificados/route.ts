import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { generarCertificado, obtenerCertificadoDeEstudio, urlVerificacion } from '@/lib/certificados/certificados';

export const dynamic = 'force-dynamic';

// El certificado «Tentare Verified Studio» de tu estudio: consultarlo o
// generarlo. El studio_id sale SIEMPRE de la sesión de staff, nunca del
// body — mismo criterio que el resto de rutas (/api/cierres, etc.). Generar o
// revocar el certificado es SOLO de la propietaria (mismo criterio que el
// nombre del estudio o las sedes: es la identidad legal del negocio, no la
// operación diaria de la sede que sí lleva la gerencia).

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const certificado = await obtenerCertificadoDeEstudio(sesion.studioId);
  if (!certificado) return NextResponse.json({ certificado: null });
  return NextResponse.json({ certificado: { ...certificado, urlVerificacion: urlVerificacion(certificado.codigo) } });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const r = await generarCertificado(sesion.studioId);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json({ certificado: { ...r, urlVerificacion: urlVerificacion(r.codigo) } });
}
