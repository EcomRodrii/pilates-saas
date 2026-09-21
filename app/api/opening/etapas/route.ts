import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarApertura, puedeMoverDinero } from '@/lib/permisos-reglas';
import { validarEtapa, type EtapaVista, type TipoEtapa, type AlCompletar } from '@/lib/opening/etapas';
import { finDelDiaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '@/lib/utils';

// Etapas de lanzamiento (Fundadora, acceso anticipado…) de Opening OS.
//
// ⚠️ Cliente service-role: la RLS NO filtra. Rol comprobado con el mismo
// criterio que la RLS de launch_stages (puedeGestionarApertura) y todo acotado
// a `studio_id`. El cierre por cupo/fecha lo hace la BD (trigger + pg_cron,
// migr 20260921161026); aquí solo se crea, se lista y se borra.

async function sesionConPermiso(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeGestionarApertura(sesion.rol)) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
  return { sesion };
}

// fecha_fin es exclusiva (medianoche del día siguiente): el último día es 1 ms antes.
const diaEstudio = (iso: string, exclusivo = false) =>
  hoyEnEstudio(new Date(new Date(iso).getTime() - (exclusivo ? 1 : 0)));

export async function GET(req: NextRequest) {
  const { sesion, error } = await sesionConPermiso(req);
  if (error) return error;
  const admin = requireSupabaseAdmin();

  const [etapasR, planesR] = await Promise.all([
    admin.from('launch_stages')
      .select('id, etapa, plan_id, fecha_inicio, fecha_fin, limite_plazas, al_completar, estado, cerrada_motivo')
      .eq('studio_id', sesion.studioId).order('fecha_inicio', { ascending: true }),
    admin.from('planes_tarifa').select('id, nombre, tipo, precio, activo').eq('studio_id', sesion.studioId),
  ]);
  if (etapasR.error || planesR.error) {
    console.error('[opening:etapas:get]', etapasR.error ?? planesR.error);
    return NextResponse.json({ error: 'No se pudieron cargar las etapas' }, { status: 500 });
  }

  const planes = planesR.data ?? [];
  const nombrePlan = new Map(planes.map(p => [p.id as string, p.nombre as string]));
  const ventas = await Promise.all((etapasR.data ?? []).map(e =>
    admin.rpc('opening_ventas_etapa', { p_stage_id: e.id }).then(r => {
      if (r.error) console.error('[opening:etapas:ventas]', r.error);
      return r.error ? null : Number(r.data ?? 0);
    })));
  if (ventas.some(v => v === null)) {
    return NextResponse.json({ error: 'No se pudieron contar las ventas' }, { status: 500 });
  }

  const etapas: EtapaVista[] = (etapasR.data ?? []).map((e, i) => ({
    id: e.id as string,
    etapa: e.etapa as TipoEtapa,
    planId: (e.plan_id as string | null) ?? null,
    planNombre: e.plan_id ? nombrePlan.get(e.plan_id as string) ?? null : null,
    desde: diaEstudio(e.fecha_inicio as string),
    hasta: diaEstudio(e.fecha_fin as string, true),
    limitePlazas: (e.limite_plazas as number | null) ?? null,
    alCompletar: e.al_completar as AlCompletar,
    cerrada: e.estado === 'CERRADA',
    cerradaMotivo: (e.cerrada_motivo as 'CUPO' | 'FECHA' | null) ?? null,
    ventas: ventas[i] as number,
  }));

  return NextResponse.json({
    hoy: hoyEnEstudio(),
    puedeCerrarVenta: puedeMoverDinero(sesion.rol),
    etapas,
    planes: planes.filter(p => p.activo).map(p => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, precio: Number(p.precio) })),
  });
}

export async function POST(req: NextRequest) {
  const { sesion, error } = await sesionConPermiso(req);
  if (error) return error;
  const v = validarEtapa(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // Cerrar la venta desactiva el plan: mismo permiso que desactivarlo a mano
  // (RLS de planes_tarifa, puede_mover_dinero). Sin esto, MANAGER lo haría
  // con una etapa de fechas pasadas.
  if (v.etapa.alCompletar === 'CERRAR' && !puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Solo quien gestiona los cobros puede elegir cerrar la venta' }, { status: 403 });
  }
  const admin = requireSupabaseAdmin();

  const { data: plan, error: planErr } = await admin.from('planes_tarifa')
    .select('id').eq('id', v.etapa.planId).eq('studio_id', sesion.studioId).eq('activo', true).maybeSingle();
  if (planErr) {
    console.error('[opening:etapas:post] plan', planErr);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
  if (!plan) return NextResponse.json({ error: 'Ese plan no existe o no está a la venta' }, { status: 400 });

  const { data, error: insErr } = await admin.from('launch_stages').insert({
    studio_id: sesion.studioId,
    etapa: v.etapa.etapa,
    plan_id: v.etapa.planId,
    fecha_inicio: inicioDelDiaEstudio(v.etapa.desde),
    fecha_fin: finDelDiaEstudio(v.etapa.hasta),
    limite_plazas: v.etapa.limitePlazas,
    al_completar: v.etapa.alCompletar,
    estado: 'ACTIVA',
  }).select('id').single();
  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ error: 'Ya hay una etapa de ese tipo que empieza ese día' }, { status: 409 });
    console.error('[opening:etapas:post]', insErr);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  // Una etapa creada ya llena o ya vencida se cierra en el acto, no a los 15 min.
  const cierre = await admin.rpc('opening_cerrar_etapa_si_toca', { p_stage_id: data.id });
  if (cierre.error) console.error('[opening:etapas:post] cierre', cierre.error);

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const { sesion, error } = await sesionConPermiso(req);
  if (error) return error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Etapa no válida' }, { status: 400 });

  const admin = requireSupabaseAdmin();
  const { data, error: delErr } = await admin.from('launch_stages')
    .delete().eq('id', id).eq('studio_id', sesion.studioId).select('id');
  if (delErr) {
    console.error('[opening:etapas:delete]', delErr);
    return NextResponse.json({ error: 'No se pudo borrar' }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
