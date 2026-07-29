import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { abrirPuertaDelEstudio } from '@/lib/kisi-servidor';

// Abre la puerta del estudio vía Kisi al hacer CHECK-IN desde el panel.
// abrirPuertaKisi existía desde el día uno pero ningún flujo la llamaba — la
// integración se podía conectar y probar, pero jamás abría nada. La llama el
// check-in de recepción (studio-context.checkin, fire-and-forget) con la clave
// del propio estudio.
//
// La resolución de cerradura vive en lib/kisi-servidor: la comparte con el pase
// de la clienta, y la parte delicada —con varias cerraduras, "abrir la primera"
// es abrir una puerta cualquiera— no puede existir por duplicado.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'kisi-abrir', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const r = await abrirPuertaDelEstudio(sesion.studioId);
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
