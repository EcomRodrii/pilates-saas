import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { aplicarCierreEstudio } from '@/lib/cierres/aplicar-cierre';
import { accionCierre } from '@/lib/cierres/quitar-cierre';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { hoyEnEstudio } from '@/lib/utils';

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

// Quitar un cierre que viene, o reabrir uno en curso. Solo borra la fila: las
// clases canceladas, sus reservas, los avisos y los días de más de los bonos
// NO se deshacen (lib/cierres/quitar-cierre.ts lo explica y la confirmación lo
// dice). Uno que ya pasó no se toca: no hay días que reabrir. Tampoco se toca
// `cierres_prorrogas`: es lo que impide sumar otra vez esos días si el cierre se
// vuelve a poner.
//
// Compare-and-set: se borra solo si la fila sigue siendo la que vio la
// pantalla (mismo id, mismas fechas, del estudio de la sesión y sin haber
// terminado), y se cuentan las filas borradas. Cero = no estaba así: 409, no
// «hecho».
export async function DELETE(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { id?: unknown; desde?: unknown; hasta?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const desde = typeof body?.desde === 'string' ? body.desde : '';
  const hasta = typeof body?.hasta === 'string' ? body.hasta : '';
  if (!id || !FECHA.test(desde) || !FECHA.test(hasta)) {
    return NextResponse.json({ error: 'Falta qué cierre quitar' }, { status: 400 });
  }

  const hoy = hoyEnEstudio();
  if (!accionCierre({ desde, hasta }, hoy)) {
    return NextResponse.json({ error: 'Ese cierre ya pasó: no hay días que reabrir' }, { status: 409 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await admin.from('cierres_estudio').delete()
    .eq('id', id).eq('studio_id', sesion.studioId)
    .eq('desde', desde).eq('hasta', hasta).gte('hasta', hoy)
    .select('id');
  if (error) return NextResponse.json({ error: 'No se ha podido quitar el cierre' }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: 'Ese cierre ya no está como lo veías' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, id });
}
