import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { aplicarCierreEstudio } from '@/lib/cierres/aplicar-cierre';

export const dynamic = 'force-dynamic';
// Un cierre de varias semanas cancela clase por clase, y cada una manda su
// correo. Con el máximo de 60s se cortaba a media semana dejando media agenda
// cancelada y media no.
export const maxDuration = 300;

// Declarar un cierre del centro: guarda el rango, cancela las clases que caen
// dentro (devolviendo bono y avisando) y prorroga las caducidades.
//
// ⚠️ El estudio sale SIEMPRE de la sesión de staff, nunca del body — mismo
// criterio que el resto de rutas. Y el rol se comprueba AQUÍ, no en la RPC:
// `aplicarCierreEstudio` trabaja con service-role, donde `auth.uid()` es NULL y
// cualquier guardia basada en él quedaría bypaseada en silencio.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as
    { desde?: string; hasta?: string; motivo?: string } | null;
  if (!body?.desde || !body?.hasta || !FECHA.test(body.desde) || !FECHA.test(body.hasta)) {
    return NextResponse.json({ error: 'Faltan las fechas del cierre' }, { status: 400 });
  }
  if (body.hasta < body.desde) {
    return NextResponse.json({ error: 'La fecha de fin no puede ser anterior a la de inicio' }, { status: 400 });
  }

  const r = await aplicarCierreEstudio({
    studioId: sesion.studioId,
    desde: body.desde, hasta: body.hasta,
    motivo: body.motivo?.trim() || null,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
