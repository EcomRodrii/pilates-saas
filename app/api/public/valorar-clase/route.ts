import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { normalizarValoracion, puedeValorarReserva } from '@/lib/valoraciones/reglas';
import { guardarValoracion } from '@/lib/valoraciones/guardar';
import { elegirClaseParaValorar, VENTANA_VALORAR_MS } from '@/lib/valoraciones/pendiente';

// Valorar una clase DESDE LA APP de la alumna (la otra puerta es el deep link
// del email, `/api/public/valorar`, con token firmado).
//
// SEGURIDAD: mismo patrón que /api/public/reserva — sesión real (JWT de
// Supabase Auth), y el socioId sale del token verificado, nunca del body.
//
// REGLA: solo se valora una clase a la que se ha ASISTIDO (`reservas.estado`).
// Se decide aquí, no en la pantalla.

export const dynamic = 'force-dynamic';

async function socia(req: NextRequest, studioId: string) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return null;
  return socioAutenticado(user.userId, studioId);
}

/**
 * ¿Puede valorar esta clase, y qué puso si ya lo hizo?
 *
 * Con `?pendiente=1` (sin `sesionId`): la clase que puede valorar AHORA en Inicio
 * («¿Qué tal la clase?»), o `null`. Va aquí y no en el catálogo de la app porque
 * ese catálogo solo trae clases que aún no han terminado (lib/valoraciones/pendiente.ts).
 */
export async function GET(req: NextRequest) {
  const studioId = req.nextUrl.searchParams.get('studioId') ?? '';
  const sesionId = req.nextUrl.searchParams.get('sesionId') ?? '';
  if (studioId && !sesionId && req.nextUrl.searchParams.get('pendiente') === '1') return pendiente(req, studioId);
  if (!studioId || !sesionId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });

  const socioId = await socia(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [{ data: res }, { data: val }] = await Promise.all([
    admin.from('reservas').select('estado').eq('studio_id', studioId).eq('sesion_id', sesionId).eq('socio_id', socioId)
      .order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    admin.from('valoraciones').select('puntuacion, comentario').eq('studio_id', studioId).eq('sesion_id', sesionId).eq('socio_id', socioId).maybeSingle(),
  ]);
  const puede = puedeValorarReserva(res?.estado);
  return NextResponse.json({
    puedeValorar: puede.ok,
    motivo: puede.ok ? null : puede.motivo,
    valoracion: val ? { puntuacion: val.puntuacion, comentario: val.comentario ?? null } : null,
  });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-valorar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { studioId?: string; sesionId?: string; puntuacion?: number; comentario?: string | null } | null;
  if (!body?.studioId || !body?.sesionId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  const v = normalizarValoracion(body.puntuacion, body.comentario);
  if (!v) return NextResponse.json({ error: 'Puntuación no válida' }, { status: 400 });

  const socioId = await socia(req, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: res } = await admin.from('reservas').select('estado')
    .eq('studio_id', body.studioId).eq('sesion_id', body.sesionId).eq('socio_id', socioId)
    .order('creado_en', { ascending: false }).limit(1).maybeSingle();
  const puede = puedeValorarReserva(res?.estado);
  if (!puede.ok) {
    return NextResponse.json({
      error: puede.motivo === 'sin-reserva' ? 'No tienes reserva en esta clase.' : 'Solo puedes valorar una clase a la que hayas asistido.',
      motivo: puede.motivo,
    }, { status: 403 });
  }

  try {
    const r = await guardarValoracion(admin, { studioId: body.studioId, sesionId: body.sesionId, socioId, ...v });
    if (!r.ok) {
      if (r.status === 500) return errorInterno('public/valorar-clase:POST', r.detalle, r.error);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, actualizada: r.actualizada });
  } catch (err) {
    return errorInterno('public/valorar-clase:POST', err, 'No se ha podido guardar tu valoración.');
  }
}

/**
 * La clase recién terminada (menos de 24 h) a la que ASISTIÓ y que aún no ha
 * valorado. Solo lo suyo: sus reservas, por el `socioId` del JWT. Devuelve lo
 * justo para la tarjeta —qué clase, con quién y cuándo terminó—.
 */
async function pendiente(req: NextRequest, studioId: string) {
  const socioId = await socia(req, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const ahora = Date.now();
    // Las clases del estudio que terminaron en las últimas 24 h: una ventana
    // corta, así que son pocas filas pase lo que pase con el historial.
    const { data: sesiones, error: e1 } = await admin.from('sesiones')
      .select('id, fin, tipo_clase_id, instructor_id')
      .eq('studio_id', studioId).eq('cancelada', false)
      .gte('fin', new Date(ahora - VENTANA_VALORAR_MS).toISOString()).lte('fin', new Date(ahora).toISOString());
    if (e1) throw e1;
    if (!sesiones?.length) return NextResponse.json({ pendiente: null });
    const ids = sesiones.map((x) => x.id as string);

    const [{ data: reservas, error: e2 }, { data: valoradas, error: e3 }] = await Promise.all([
      admin.from('reservas').select('sesion_id, estado').eq('studio_id', studioId).eq('socio_id', socioId).in('sesion_id', ids),
      admin.from('valoraciones').select('sesion_id').eq('studio_id', studioId).eq('socio_id', socioId).in('sesion_id', ids),
    ]);
    if (e2) throw e2;
    if (e3) throw e3;
    const asistidas = new Set((reservas ?? []).filter((r) => puedeValorarReserva(r.estado as string).ok).map((r) => r.sesion_id as string));
    const yaValoradas = new Set((valoradas ?? []).map((v) => v.sesion_id as string));
    const elegida = elegirClaseParaValorar(
      sesiones.map((x) => ({ id: x.id as string, fin: x.fin as string })), asistidas, yaValoradas, ahora,
    );
    if (!elegida) return NextResponse.json({ pendiente: null });

    const fila = sesiones.find((x) => x.id === elegida.id)!;
    const [{ data: tipo }, { data: instructora }] = await Promise.all([
      fila.tipo_clase_id
        ? admin.from('tipos_clase').select('nombre').eq('id', fila.tipo_clase_id).eq('studio_id', studioId).maybeSingle()
        : Promise.resolve({ data: null }),
      fila.instructor_id
        ? admin.from('instructores').select('nombre').eq('id', fila.instructor_id).eq('studio_id', studioId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json({
      pendiente: {
        sesionId: elegida.id,
        fin: elegida.fin,
        clase: (tipo?.nombre as string | undefined) ?? 'tu clase',
        instructora: (instructora?.nombre as string | undefined) ?? null,
      },
    });
  } catch (err) {
    return errorInterno('public/valorar-clase:pendiente', err, 'No se ha podido comprobar tu última clase.');
  }
}
