import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { repetirMesEncendido } from '@/lib/interruptor-por-estudio';
import { hoyEnEstudio } from '@/lib/utils';
import { esMes, mesSiguiente, ultimoDia } from '@/lib/series/repetir-mes';
import { crearRepetir, MAX_FECHAS, MAX_SERIES, proponerRepetir, repetirDisponible } from '@/lib/series/repetir-mes-servidor';

export const dynamic = 'force-dynamic';
// Crear un mes entero son varias series, una transacción cada una.
export const maxDuration = 120;

// «Repetir este mes» (P1.7): GET dice si está disponible; POST `proponer` simula
// y POST `crear` crea solo lo marcado. Todo en el servidor: el navegador nunca
// llama a la RPC.
//
// ⚠️ El estudio sale SIEMPRE de la sesión, y el rol se comprueba AQUÍ (la RPC va
// con service-role). Mismo permiso que renovar una serie
// (`/api/series/renovar`): `puedeGestionarCalendario`.
//
// Apagado mientras el interruptor `CALENDARIO_REPETIR_MES` no lo encienda para
// el estudio Y la migración 20261012210100 no esté aplicada (la sonda lo mira).
/** YYYY-MM-DD que existe: un 30 de febrero haría fallar la serie entera en la RPC. */
const fechaReal = (f: unknown): f is string =>
  typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10) === f;

async function puerta(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeGestionarCalendario(sesion.rol)) {
    return { error: NextResponse.json({ error: 'No tienes permiso para crear clases' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ('error' in p) return p.error;
  const disponible = repetirMesEncendido(p.sesion.studioId) && await repetirDisponible(p.admin, p.sesion.studioId);
  return NextResponse.json({ disponible });
}

export async function POST(req: NextRequest) {
  const p = await puerta(req);
  if ('error' in p) return p.error;
  const { sesion, admin } = p;
  if (!repetirMesEncendido(sesion.studioId)) return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  const limited = await enforceRateLimit(req, 'series-repetir-mes', { max: 10, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { accion?: unknown; mes?: unknown; series?: unknown } | null;
  if (!esMes(body?.mes)) return NextResponse.json({ error: 'Falta el mes' }, { status: 400 });
  const mes = body.mes;

  if (body.accion === 'proponer') {
    const r = await proponerRepetir(admin, sesion.studioId, mes);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, propuesta: r.propuesta });
  }

  if (body.accion !== 'crear' || !Array.isArray(body.series)) {
    return NextResponse.json({ error: 'Falta qué crear' }, { status: 400 });
  }
  // Lo que pide el navegador se valida entero antes de crear nada: formas,
  // topes y fechas dentro de [hoy, último día del mes siguiente]. La serie de
  // otro estudio la rechaza la RPC (filtra por el estudio de la sesión).
  const hoy = hoyEnEstudio();
  const hasta = ultimoDia(mesSiguiente(mes));
  const plan: { serieId: string; periodoVisto: number; fechas: string[] }[] = [];
  // Los topes, ANTES de recorrer nada.
  if ((body.series as unknown[]).length > MAX_SERIES) {
    return NextResponse.json({ error: 'Son demasiadas clases de una vez' }, { status: 400 });
  }
  for (const x of body.series as unknown[]) {
    const s = x as { serieId?: unknown; periodoVisto?: unknown; fechas?: unknown };
    if (typeof s?.serieId !== 'string' || !Number.isInteger(s.periodoVisto) || !Array.isArray(s.fechas)) {
      return NextResponse.json({ error: 'Lo que se ha pedido no tiene la forma esperada' }, { status: 400 });
    }
    if (s.fechas.length > MAX_FECHAS) return NextResponse.json({ error: 'Son demasiadas clases de una vez' }, { status: 400 });
    const fechas = [...new Set(s.fechas as unknown[])];
    if (!fechas.every((f): f is string => fechaReal(f) && f >= hoy && f <= hasta)) {
      return NextResponse.json({ error: 'Alguna fecha ya ha pasado o no es de ese mes' }, { status: 400 });
    }
    if (fechas.length > 0) plan.push({ serieId: s.serieId, periodoVisto: s.periodoVisto as number, fechas });
  }
  const total = plan.reduce((n, s) => n + s.fechas.length, 0);
  if (plan.length === 0) return NextResponse.json({ error: 'No has marcado ninguna clase' }, { status: 400 });
  if (plan.length > MAX_SERIES || total > MAX_FECHAS) {
    return NextResponse.json({ error: 'Son demasiadas clases de una vez' }, { status: 400 });
  }
  if (new Set(plan.map((s) => s.serieId)).size !== plan.length) {
    return NextResponse.json({ error: 'Una clase aparece dos veces' }, { status: 400 });
  }

  const r = await crearRepetir(admin, sesion.studioId, sesion.userId, mes, plan);
  // Todo falló: un error de verdad, nunca un 200 con cero.
  if (r.creadas === 0 && r.fallidas === plan.length) {
    return NextResponse.json({ error: 'No se ha creado ninguna clase. Inténtalo de nuevo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, resultado: r });
}
