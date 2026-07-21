import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { mapIngresoManual, desglosarIvaDesdeTotal } from '@/lib/fiscal/cierre-engine';
import type { RowIngresosManuales } from '@/lib/db-types';

// CRUD de ingresos cobrados FUERA de Tentare que el estudio añade al cierre de
// año (efectivo, transferencia, otra plataforma…). Solo staff autenticado; el
// studio_id sale SIEMPRE del JWT (nunca del body) y toda operación se acota a
// ese estudio, con service-role. Base y cuota de IVA se calculan en el servidor
// a partir del total (IVA incluido) + tipo, para que cuadren siempre.

function saneaEntrada(body: Record<string, unknown>) {
  const fecha = typeof body.fecha === 'string' ? body.fecha.slice(0, 10) : '';
  const concepto = String(body.concepto ?? '').trim();
  const total = Number(body.total);
  const tipoIva = Number(body.tipoIva ?? body.tipoIVA ?? 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Fecha no válida (YYYY-MM-DD)' as const };
  if (!concepto) return { error: 'Falta el concepto' as const };
  if (!Number.isFinite(total) || total <= 0) return { error: 'El importe debe ser mayor que 0' as const };
  if (!Number.isFinite(tipoIva) || tipoIva < 0 || tipoIva > 100) return { error: 'Tipo de IVA no válido' as const };
  const { base, cuota } = desglosarIvaDesdeTotal(total, tipoIva);
  return {
    fecha, concepto,
    cliente: body.cliente == null || body.cliente === '' ? null : String(body.cliente).trim(),
    nif: body.nif == null || body.nif === '' ? null : String(body.nif).trim(),
    nota: body.nota == null || body.nota === '' ? null : String(body.nota).trim(),
    base_imponible: base, tipo_iva: tipoIva, cuota_iva: cuota, total: Math.round(total * 100) / 100,
  };
}

// ── Listar (por año) ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const anio = Number(new URL(req.url).searchParams.get('anio'));
  let q = admin.from('ingresos_manuales').select('*').eq('studio_id', sesion.studioId);
  if (Number.isInteger(anio) && anio > 2000) {
    q = q.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
  }
  const { data, error } = await q.order('fecha', { ascending: true });
  if (error) return errorInterno('ingresos-manuales:listar', error, 'No se han podido cargar los ingresos manuales.');
  return NextResponse.json({ ingresos: (data ?? []).map((r) => mapIngresoManual(r as RowIngresosManuales)) });
}

// ── Crear ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 });
  const s = saneaEntrada(body);
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: 400 });

  const row = { id: uid(), studio_id: sesion.studioId, ...s };
  const { error } = await admin.from('ingresos_manuales').insert(row);
  if (error) return errorInterno('ingresos-manuales:crear', error, 'No se ha podido guardar el ingreso. Inténtalo de nuevo.');
  return NextResponse.json({ ingreso: mapIngresoManual(row as RowIngresosManuales) });
}

// ── Editar ───────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id || !body) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
  const s = saneaEntrada(body);
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: 400 });

  const { data, error } = await admin
    .from('ingresos_manuales').update(s)
    .eq('id', id).eq('studio_id', sesion.studioId)
    .select('*').maybeSingle();
  if (error) return errorInterno('ingresos-manuales:editar', error, 'No se han podido guardar los cambios.');
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ingreso: mapIngresoManual(data as RowIngresosManuales) });
}

// ── Borrar ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const { error } = await admin.from('ingresos_manuales').delete().eq('id', id).eq('studio_id', sesion.studioId);
  if (error) return errorInterno('ingresos-manuales:borrar', error, 'No se ha podido eliminar el ingreso.');
  return NextResponse.json({ ok: true });
}
