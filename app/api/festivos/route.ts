import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarSede } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { esTablaQueFalta } from '@/lib/db/tabla-que-falta';
import { enforceRateLimit } from '@/lib/rate-limit';
import { avisoFestivosEncendido } from '@/lib/interruptor-por-estudio';
import { hoyEnEstudio } from '@/lib/utils';
import { festivosPorDecidir, zonaDeEstudio } from '@/lib/festivos/por-decidir-servidor';
import { festivoAbrible } from '@/lib/festivos/por-decidir';
import { NOMBRE_ZONA } from '@/lib/festivos/oficiales';
import { festivosGuardadosEntre } from '@/lib/festivos/estudio-servidor';

export const dynamic = 'force-dynamic';

// Festivos con clases que esperan que el estudio decida (P1.6): los oficiales
// de su zona y los que ha guardado en el módulo Festivos.
// GET los lista; POST `{ accion: 'abrir', fecha }` apunta «Abrimos igualmente».
// El alcance «aviso» (la bandeja) va con `FESTIVOS_AVISO`; «todos» es el
// «Comprobar clases» del módulo Festivos, que tienen todos los estudios, y
// «abrir» es su «Abrimos igualmente»: los dos, sin interruptor.
// «Cerrar ese día» NO pasa por aquí: va al POST /api/cierres de siempre, para
// que el resultado sea exactamente el de «Cerrar el centro».
//
// ⚠️ El estudio sale SIEMPRE de la sesión, y el rol se comprueba AQUÍ: todo va
// con service-role. Mismo permiso que declarar un cierre (`puedeGestionarSede`:
// PROPIETARIO y MANAGER); recepción no, porque no puede cerrar.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarSede(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const alcance = req.nextUrl.searchParams.get('alcance') === 'todos' ? 'todos' : 'aviso';
  // «Ver todos» son hasta ~30 lecturas: con su tope.
  if (alcance === 'todos') {
    const limited = await enforceRateLimit(req, 'festivos-lista', { max: 30, windowSeconds: 60 }, sesion.studioId);
    if (limited) return limited;
  }
  const encendido = alcance === 'todos' || avisoFestivosEncendido(sesion.studioId);
  const r = await festivosPorDecidir(admin, { studioId: sesion.studioId, ahora: new Date(), alcance, conReservas: true, encendido });
  if (!r) return NextResponse.json({ error: 'No se han podido leer los festivos' }, { status: 500 });
  if (!r.disponible) return NextResponse.json({ disponible: false });
  return NextResponse.json({
    disponible: true,
    zona: r.zona ? NOMBRE_ZONA[r.zona] : null,
    hoy: hoyEnEstudio(),
    festivos: r.festivos,
    propios: r.propios,
  });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarSede(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'festivos', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { accion?: unknown; fecha?: unknown } | null;
  if (body?.accion !== 'abrir' || typeof body.fecha !== 'string') {
    return NextResponse.json({ error: 'Falta el día' }, { status: 400 });
  }

  // La zona se recalcula aquí, y el nombre que se guarda sale de la tabla
  // oficial o de la fila que el estudio guardó: el cliente solo dice qué día.
  const zona = await zonaDeEstudio(admin, sesion.studioId);
  if (zona === 'error') return NextResponse.json({ error: 'No se ha podido comprobar el festivo' }, { status: 500 });
  const guardados = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? await festivosGuardadosEntre(admin, sesion.studioId, body.fecha, body.fecha) : [];
  if (guardados === 'error') return NextResponse.json({ error: 'No se ha podido comprobar el festivo' }, { status: 500 });
  const festivo = festivoAbrible(zona, body.fecha, hoyEnEstudio(), guardados);
  if (!festivo) return NextResponse.json({ error: 'Ese día no es un festivo próximo de tu zona ni de tu lista' }, { status: 400 });

  // Si alguien lo cerró mientras tanto, gana el cierre: no se apunta «abrimos».
  const { data: cierre, error: errCierre } = await admin.from('cierres_estudio').select('id')
    .eq('studio_id', sesion.studioId).lte('desde', festivo.fecha).gte('hasta', festivo.fecha).limit(1);
  if (errCierre) return NextResponse.json({ error: 'No se ha podido comprobar el festivo' }, { status: 500 });
  if ((cierre ?? []).length > 0) {
    return NextResponse.json({ error: 'Ese día ya está cerrado. Si quieres abrirlo, quita el cierre en Configuración › Mi estudio.' }, { status: 409 });
  }

  // Idempotente: decidir dos veces el mismo festivo no duplica ni falla.
  const { error } = await admin.from('festivos_abiertos').upsert(
    { studio_id: sesion.studioId, fecha: festivo.fecha, nombre: festivo.nombre, decidido_por: sesion.userId },
    { onConflict: 'studio_id,fecha', ignoreDuplicates: true },
  );
  if (error) {
    if (esTablaQueFalta(error)) return NextResponse.json({ error: 'No disponible' }, { status: 404 });
    console.error('[festivos:abrir]', error);
    return NextResponse.json({ error: 'No se ha podido guardar. Inténtalo de nuevo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, fecha: festivo.fecha, nombre: festivo.nombre });
}
