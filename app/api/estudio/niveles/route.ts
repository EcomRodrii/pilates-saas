import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { nivelesConRitmoEncendido } from '@/lib/interruptor-por-estudio';
import { fetchAllRows, mapLevelDefinition } from '@/lib/supabase-data';
import { errorInterno } from '@/lib/errores-servidor';
import { hoyEnEstudio, inicioDelDiaEstudio, masDias, uid } from '@/lib/utils';
import { escala, quienBajaria, validarNiveles, type NivelComparable } from '@/lib/gamificacion/ritmo-niveles';
import type { RowLevelDefinitions } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// P3.8 — los niveles con ritmo (diseño 23). Solo la propietaria, con el plan
// que incluye gamificación y con `GAMIFICACION_NIVELES_RITMO` encendido.
//   · GET: los totales ganados de las alumnas del estudio (sin ids ni nombres,
//     para la vista previa) y cuántas clases recientes se quedaron sin lista.
//   · PUT: guarda la escala entera. ⚠️ NADIE BAJA: si alguna alumna con algo
//     ganado perdería su nivel o quedaría en uno más bajo, 409 y no se guarda
//     nada («sin recalcular nada ya concedido», decisión del fundador). Un nivel
//     no da nada (sus beneficios son texto): esto no toca créditos ni reglas.
//
// Corre con service-role: el estudio sale SIEMPRE de la sesión y cada consulta
// filtra por él. Los totales incluyen a las dadas de baja: protegerlas también
// es lo conservador.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function puerta(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') return { respuesta: NextResponse.json({ error: 'Solo la propietaria puede cambiar los niveles' }, { status: 403 }) };
  if (!nivelesConRitmoEncendido(sesion.studioId)) return { respuesta: NextResponse.json({ error: 'No disponible' }, { status: 404 }) };
  const sinPlan = await bloqueoPorFeature(sesion.studioId, 'gamificacion');
  if (sinPlan) return { respuesta: sinPlan };
  const admin = getSupabaseAdmin();
  if (!admin) return { respuesta: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

async function totalesDe(admin: Admin, studioId: string): Promise<number[] | null> {
  const r = await fetchAllRows<{ socio_id: string; total_ganado: number | null }>(studioId, 'member_credits', (from, to) =>
    admin.from('member_credits').select('socio_id, total_ganado').eq('studio_id', studioId).order('socio_id').range(from, to));
  if (r.error) return null;
  return r.data.map((x) => Number(x.total_ganado ?? 0)).sort((a, b) => a - b);
}

/**
 * Clases de los últimos 90 días ya terminadas, con alumnas, en las que nadie
 * quedó como «vino». Si el estudio pasa lista y no la pasa, nadie suma créditos
 * por asistir y los niveles no se mueven: la pantalla lo avisa.
 */
async function sinListaDe(admin: Admin, studioId: string): Promise<{ clases: number; sinNadie: number } | null> {
  const desde = inicioDelDiaEstudio(masDias(hoyEnEstudio(), -90));
  const ahora = new Date().toISOString();
  const r = await fetchAllRows<{ id: string; sesion_id: string; estado: string }>(studioId, 'reservas', (from, to) =>
    admin.from('reservas')
      .select('id, sesion_id, estado, sesiones!inner(inicio, fin, cancelada, studio_id)')
      .eq('studio_id', studioId)
      .eq('sesiones.studio_id', studioId)
      .not('sesiones.cancelada', 'is', true)
      .gte('sesiones.inicio', desde)
      .lt('sesiones.fin', ahora)
      .in('estado', ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'])
      .order('id').range(from, to));
  if (r.error) return null;
  const vino = new Map<string, boolean>();
  for (const x of r.data) vino.set(x.sesion_id, (vino.get(x.sesion_id) ?? false) || x.estado === 'ASISTIDA');
  let sinNadie = 0;
  for (const v of vino.values()) if (!v) sinNadie++;
  return { clases: vino.size, sinNadie };
}

export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ('respuesta' in p) return p.respuesta;
  const { sesion, admin } = p;
  // Cada lectura pagina todos los créditos y 90 días de reservas.
  const limited = await enforceRateLimit(req, 'estudio-niveles-leer', { max: 20, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  try {
    const [totales, sinLista] = await Promise.all([totalesDe(admin, sesion.studioId), sinListaDe(admin, sesion.studioId)]);
    if (!totales) return NextResponse.json({ error: 'No se han podido leer los créditos de tus alumnas.' }, { status: 503 });
    return NextResponse.json({ totales, sinLista }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('estudio/niveles:GET', err, 'No se han podido leer los niveles.');
  }
}

export async function PUT(req: NextRequest) {
  const p = await puerta(req);
  if ('respuesta' in p) return p.respuesta;
  const { sesion, admin } = p;
  const studioId = sesion.studioId;
  const limited = await enforceRateLimit(req, 'estudio-niveles', { max: 20, windowSeconds: 60 }, studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { niveles?: unknown } | null;
  const v = validarNiveles(body?.niveles);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const { data: actuales, error: eActuales } = await admin
      .from('level_definitions').select('id, umbral_creditos, activo, orden').eq('studio_id', studioId);
    if (eActuales) return NextResponse.json({ error: 'No se han podido leer los niveles.' }, { status: 503 });
    const antes: NivelComparable[] = (actuales ?? []).map((n) => ({ id: n.id as string, umbralCreditos: Number(n.umbral_creditos), activo: n.activo !== false, orden: Number(n.orden ?? 0) }));
    // ⚠️ La PK es solo `id` y el upsert va con service-role: este filtro es lo que
    // impide pisar el nivel de OTRO estudio con su id (los ids de nivel viajan en
    // la app de la alumna, no son secretos). Lo vigila ruta-niveles-contrato.test.ts.
    const deEsteEstudio = new Set(antes.map((n) => n.id));
    if (v.niveles.some((n) => n.id && !deEsteEstudio.has(n.id))) {
      return NextResponse.json({ error: 'Uno de los niveles ya no existe. Recarga la página.' }, { status: 409 });
    }
    // Los nuevos, con su id definitivo ya: así la comparación y el guardado usan el mismo.
    const niveles = v.niveles.map((n) => ({ ...n, id: n.id ?? `lvl-${uid()}` }));

    const totales = await totalesDe(admin, studioId);
    // Sin los totales no se sabe si alguien bajaría: no se guarda.
    if (!totales) return NextResponse.json({ error: 'No se han podido leer los créditos de tus alumnas. No se ha guardado nada.' }, { status: 503 });
    // Entre leer los totales y guardar pasan milisegundos sin candado: solo podría
    // afectar a quien cruce un umbral justo entonces, y un nivel no da nada (es
    // estético). Aceptado a propósito: una RPC con candado costaría migración.
    const bajarian = quienBajaria(totales, antes, niveles);
    if (bajarian > 0) {
      return NextResponse.json({
        error: `Con este cambio ${bajarian === 1 ? '1 alumna bajaría' : `${bajarian} alumnas bajarían`} de nivel, y lo que ya tienen no se toca. No se ha guardado nada: baja ese umbral o deja ese nivel.`,
        bajarian,
      }, { status: 409 });
    }

    // `orden` = posición por umbral (los activos primero): así el panel y la app
    // de la alumna, que ordenan distinto, enseñan lo mismo.
    const activosEnOrden = escala(niveles).map((n) => n.id);
    const posicion = new Map(activosEnOrden.map((id, i) => [id, i]));
    const inactivos = niveles.filter((n) => !n.activo);
    const filas = niveles.map((n) => ({
      id: n.id,
      studio_id: studioId,
      nombre: n.nombre,
      orden: posicion.get(n.id) ?? activosEnOrden.length + inactivos.findIndex((x) => x.id === n.id),
      umbral_creditos: n.umbralCreditos,
      color: n.color,
      icono: n.icono,
      beneficios: n.beneficios,
      activo: n.activo,
    }));

    // Los que se quitan no tienen a nadie (si no, `bajarian` > 0 y no se llega aquí).
    const quitados = antes.map((n) => n.id).filter((id) => !niveles.some((x) => x.id === id));
    if (quitados.length > 0) {
      const { error: eBorrar } = await admin.from('level_definitions').delete().eq('studio_id', studioId).in('id', quitados);
      if (eBorrar) return NextResponse.json({ error: 'No se ha podido guardar. No se ha cambiado nada.' }, { status: 503 });
    }
    const { data: guardados, error: eGuardar } = filas.length > 0
      ? await admin.from('level_definitions').upsert(filas, { onConflict: 'id' }).select('*')
      : { data: [], error: null };
    if (eGuardar) {
      return NextResponse.json({
        error: quitados.length > 0
          ? 'No se han podido guardar los niveles (los que quitaste, sin alumnas, sí se han quitado). Vuelve a intentarlo.'
          : 'No se han podido guardar los niveles. No se ha cambiado nada.',
      }, { status: 503 });
    }
    return NextResponse.json({ niveles: ((guardados ?? []) as RowLevelDefinitions[]).map(mapLevelDefinition) });
  } catch (err) {
    return errorInterno('estudio/niveles:PUT', err, 'No se han podido guardar los niveles.');
  }
}
