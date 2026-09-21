import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarApertura, puedeMoverDinero } from '@/lib/permisos-reglas';
import { validarEtapa } from '@/lib/opening/etapas';
import { cargarEtapas } from '@/lib/opening/servidor';
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

export async function GET(req: NextRequest) {
  const { sesion, error } = await sesionConPermiso(req);
  if (error) return error;
  try {
    const { etapas, planes } = await cargarEtapas(requireSupabaseAdmin(), sesion.studioId);
    return NextResponse.json({
      hoy: hoyEnEstudio(),
      puedeCerrarVenta: puedeMoverDinero(sesion.rol),
      etapas,
      planes: planes.filter(p => p.activo).map(({ id, nombre, tipo, precio }) => ({ id, nombre, tipo, precio })),
    });
  } catch (e) {
    console.error('[opening:etapas:get]', e);
    return NextResponse.json({ error: 'No se pudieron cargar las etapas' }, { status: 500 });
  }
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
