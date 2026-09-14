import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { MAX_NOTA_ESTUDIO, normalizarDecision, textoMotivoParaEstudio } from '@/lib/student/baja-instructora';

export const dynamic = 'force-dynamic';

// Bajas de última hora del equipo esperando que el estudio las revise
// (`bajas_instructora`, revisión PENDIENTE: la instructora avisó con menos de
// 24 h). Decisión del fundador (14-sep-2026): «Todo en orden» / «Lo hablamos»,
// con una nota que ella ve. Nunca es una sanción ni un descuento.
//
// ⚠️ Service-role: la RLS no actúa. Todo va acotado a `studio_id` de la sesión y
// gateado con `puedeGestionarEquipo` (propietaria y gerencia): el motivo puede
// hablar de su salud, y recepción no lo ve ni aquí ni en ningún otro sitio.

const MAX_FILAS = 50;

/**
 * La ficha de quien revisa en esta sede, si también da clases. Nadie revisa su
 * propia baja: una gerente con clases puede pedirla por el enlace firmado, y
 * marcarla ella misma «Todo en orden» dejaría un registro que no dice la verdad.
 */
async function fichaPropia(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string, userId: string,
): Promise<string | null> {
  const { data, error } = await admin.from('instructores').select('id')
    .eq('studio_id', studioId).eq('auth_user_id', userId).limit(1);
  if (error) throw error;
  return (data?.[0]?.id as string | undefined) ?? null;
}

interface FilaBaja {
  id: string; instructor_id: string; sesion_id: string;
  categoria: string | null; motivo: string | null; antelacion_minutos: number; creado_en: string;
}

// GET → las pendientes, la más antigua primero.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const propia = await fichaPropia(admin, sesion.studioId, sesion.userId);
    let pendientes = admin.from('bajas_instructora')
      .select('id, instructor_id, sesion_id, categoria, motivo, antelacion_minutos, creado_en')
      .eq('studio_id', sesion.studioId).eq('revision', 'PENDIENTE');
    if (propia) pendientes = pendientes.neq('instructor_id', propia);
    const { data, error } = await pendientes.order('creado_en', { ascending: true }).limit(MAX_FILAS);
    if (error) throw error;
    const filas = (data ?? []) as FilaBaja[];
    if (filas.length === 0) return NextResponse.json({ bajas: [] });

    const instructorIds = [...new Set(filas.map((f) => f.instructor_id))];
    const sesionIds = [...new Set(filas.map((f) => f.sesion_id))];
    const [instructoras, sesiones] = await Promise.all([
      admin.from('instructores').select('id, nombre').eq('studio_id', sesion.studioId).in('id', instructorIds),
      admin.from('sesiones').select('id, inicio, tipo_clase_id').eq('studio_id', sesion.studioId).in('id', sesionIds),
    ]);
    if (instructoras.error) throw instructoras.error;
    if (sesiones.error) throw sesiones.error;

    const filasSesion = (sesiones.data ?? []) as Array<{ id: string; inicio: string; tipo_clase_id: string | null }>;
    const tipoIds = [...new Set(filasSesion.map((s) => s.tipo_clase_id).filter((x): x is string => !!x))];
    const tipos = tipoIds.length
      ? await admin.from('tipos_clase').select('id, nombre').eq('studio_id', sesion.studioId).in('id', tipoIds)
      : { data: [] as Array<{ id: string; nombre: string }>, error: null };
    if (tipos.error) throw tipos.error;

    const nombre = new Map(((instructoras.data ?? []) as Array<{ id: string; nombre: string | null }>).map((i) => [i.id, i.nombre]));
    const sesionPorId = new Map(filasSesion.map((s) => [s.id, s]));
    const tipo = new Map(((tipos.data ?? []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre]));

    return NextResponse.json({
      bajas: filas.map((f) => {
        const s = sesionPorId.get(f.sesion_id);
        return {
          id: f.id,
          instructora: nombre.get(f.instructor_id) || 'Alguien del equipo',
          clase: (s?.tipo_clase_id && tipo.get(s.tipo_clase_id)) || 'Clase',
          inicio: s?.inicio ?? null,
          antelacionMinutos: f.antelacion_minutos,
          motivo: textoMotivoParaEstudio(f.categoria, f.motivo),
        };
      }),
    });
  } catch (err) {
    return errorInterno('equipo/bajas-instructora:GET', err, 'No se han podido cargar las bajas por revisar. Recarga la página.');
  }
}

// POST { id, decision: 'EN_ORDEN' | 'LO_HABLAMOS', nota? } → la revisa.
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'equipo-bajas-instructora-revisar', { max: 30, windowSeconds: 60 });
  if (limitado) return limitado;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const body = await req.json().catch(() => null) as { id?: unknown; decision?: unknown; nota?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const decision = normalizarDecision(body?.decision);
  if (!id || !decision) return NextResponse.json({ error: 'Falta la baja o la decisión' }, { status: 400 });
  // Recorte por caracteres y no por unidades UTF-16: partir un emoji por la
  // mitad deja un texto que Postgres rechaza.
  const nota = typeof body?.nota === 'string'
    ? Array.from(body.nota.trim()).slice(0, MAX_NOTA_ESTUDIO).join('') || null
    : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    // Compare-and-set desde PENDIENTE: dos personas decidiendo a la vez no se
    // pisan, y una ya revisada no se reescribe (ella ya habrá visto la primera).
    const propia = await fichaPropia(admin, sesion.studioId, sesion.userId);
    let revisar = admin.from('bajas_instructora')
      .update({ revision: decision, nota_estudio: nota, revisada_por: sesion.userId, revisada_en: new Date().toISOString() })
      .eq('id', id).eq('studio_id', sesion.studioId).eq('revision', 'PENDIENTE');
    if (propia) revisar = revisar.neq('instructor_id', propia);
    const { data, error } = await revisar.select('id, instructor_id, sesion_id, sustitucion_id').maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Esta baja ya no está pendiente de revisar. Recarga la página.' }, { status: 409 });
    }

    // Aviso de resolución a la instructora. Sin el resultado ni la nota: eso se
    // lee dentro de la app, no en la pantalla bloqueada.
    const { emitirBajaRevisada } = await import('@/lib/notifications/emit');
    await emitirBajaRevisada(admin, {
      studioId: sesion.studioId,
      sesionId: data.sesion_id as string,
      instructorId: data.instructor_id as string,
      sustitucionId: data.sustitucion_id as string,
      bajaId: data.id as string,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('equipo/bajas-instructora:POST', err, 'No se ha podido guardar la revisión. Inténtalo de nuevo.');
  }
}
