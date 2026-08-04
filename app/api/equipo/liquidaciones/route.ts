import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo, rolesQuePuedeAsignar } from '@/lib/permisos-reglas';
import { generarLiquidacionBorrador, transicionarLiquidacion, listarLiquidaciones, obtenerLiquidacion } from '@/lib/equipo/liquidacion-datos.ts';

// Fila 11 del informe estratégico: liquidación de instructoras (desglose
// transparente, sin pago real — ver comentario de la migración). Mismo
// patrón de autorización que /api/equipo/tarifas: PROPIETARIO/MANAGER
// gestionan todo el estudio; la instructora solo ve SU liquidación, y solo
// una vez CONFIRMADA/PAGADA (nunca un borrador que puede cambiar).

export const dynamic = 'force-dynamic';

async function resolverPropioInstructorId(
  admin: ReturnType<typeof getSupabaseAdmin> & {},
  userId: string, studioId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

function parsePeriodo(req: NextRequest): { anio: number; mes: number } | null {
  const anio = Number(req.nextUrl.searchParams.get('anio'));
  const mes = Number(req.nextUrl.searchParams.get('mes'));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  const periodo = parsePeriodo(req);
  if (!periodo) return NextResponse.json({ error: 'Falta anio/mes válidos' }, { status: 400 });

  if (!puedeGestionarEquipo(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') {
      return NextResponse.json({ error: 'No tienes permiso para ver liquidaciones' }, { status: 403 });
    }
    const instructorId = await resolverPropioInstructorId(admin, sesion.userId, sesion.studioId);
    if (!instructorId) return NextResponse.json({ items: [] });
    const row = await obtenerLiquidacion(admin, sesion.studioId, instructorId, periodo.anio, periodo.mes);
    // Nunca enseñar un BORRADOR a la propia instructora: puede recalcularse
    // y cambiar antes de confirmarse.
    const items = row && row.estado !== 'BORRADOR' ? [row] : [];
    return NextResponse.json({ items });
  }

  const instructorIdQuery = req.nextUrl.searchParams.get('instructorId');
  if (instructorIdQuery) {
    const row = await obtenerLiquidacion(admin, sesion.studioId, instructorIdQuery, periodo.anio, periodo.mes);
    return NextResponse.json({ items: row ? [row] : [] });
  }
  const items = await listarLiquidaciones(admin, sesion.studioId, periodo.anio, periodo.mes);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para generar liquidaciones' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { instructorId?: unknown; anio?: unknown; mes?: unknown } | null;
  const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
  const anio = Number(body?.anio);
  const mes = Number(body?.mes);
  if (!instructorId || !Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Faltan instructorId/anio/mes válidos' }, { status: 400 });
  }

  const { data: ficha } = await admin
    .from('instructores').select('id, rol').eq('id', instructorId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!ficha) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  // Mismo guard que PATCH /api/equipo/tarifas: un manager no gestiona la
  // compensación de la propietaria ni de otro manager.
  if (sesion.rol === 'MANAGER' && !rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never)) {
    return NextResponse.json({ error: 'No puedes generar la liquidación de esta persona.' }, { status: 403 });
  }

  const { row, error } = await generarLiquidacionBorrador(admin, sesion.studioId, instructorId, anio, mes);
  if (error) return NextResponse.json({ error }, { status: 409 });
  return NextResponse.json({ item: row });
}

export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar liquidaciones' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; accion?: unknown; referenciaPago?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const accion = body?.accion === 'confirmar' || body?.accion === 'marcar_pagada' ? body.accion : null;
  if (!id || !accion) return NextResponse.json({ error: 'Faltan id/accion válidos' }, { status: 400 });
  const referenciaPago = typeof body?.referenciaPago === 'string' ? body.referenciaPago.slice(0, 200) : null;

  // Mismo guard que POST/tarifas: hay que saber a quién pertenece la
  // liquidación antes de dejar a un manager confirmarla/marcarla pagada.
  if (sesion.rol === 'MANAGER') {
    const { data: liq } = await admin
      .from('liquidaciones_instructoras').select('instructor_id').eq('id', id).eq('studio_id', sesion.studioId).maybeSingle();
    if (!liq) return NextResponse.json({ error: 'Liquidación no encontrada' }, { status: 404 });
    const { data: ficha } = await admin.from('instructores').select('rol').eq('id', liq.instructor_id).maybeSingle();
    if (!ficha || !rolesQuePuedeAsignar('MANAGER').includes(ficha.rol as never)) {
      return NextResponse.json({ error: 'No puedes gestionar la liquidación de esta persona.' }, { status: 403 });
    }
  }

  const { row, error } = await transicionarLiquidacion(admin, id, sesion.studioId, accion, sesion.userId, referenciaPago);
  if (error) return NextResponse.json({ error }, { status: 409 });
  return NextResponse.json({ item: row });
}
