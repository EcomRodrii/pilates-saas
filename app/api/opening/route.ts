import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarApertura } from '@/lib/permisos-reglas';
import {
  analizarCapacidad, CONFIG_OPENING_DEFECTO,
  type AsistidaDemanda, type ConfigOpening, type PlanDemanda, type SuscripcionDemanda,
} from '@/lib/opening/capacidad';
import { debeMostrarApertura, diasHastaApertura } from '@/lib/opening/visibilidad';
import type { EstadoSuscripcion, TipoPlan } from '@/lib/types';

// Opening OS en la home: fecha de apertura + capacidad frente a demanda.
//
// ⚠️ Cliente service-role: la RLS NO filtra aquí. El rol se comprueba con el
// mismo criterio que la RLS de las tablas opening_* (puedeGestionarApertura) y
// TODA consulta va acotada a `studio_id`.
//
// Coste: un estudio que ya opera hace 3 lecturas mínimas y sale con
// `{ visible: false }`; el análisis completo solo corre mientras se abre.

const DIAS_HISTORIAL_ASISTENCIA = 90;
const PAGINA = 1000;

function configDesdeFila(f: Record<string, unknown> | null): ConfigOpening {
  if (!f) return CONFIG_OPENING_DEFECTO;
  return {
    umbralAmarillo: Number(f.umbral_amarillo),
    umbralRojo: Number(f.umbral_rojo),
    conversionLeads: Number(f.conversion_leads),
    ventanaAnalisisDias: Number(f.ventana_analisis_dias),
    sesionesSemanaSinTope: Number(f.sesiones_semana_sin_tope),
    semanasBonoSinCaducidad: Number(f.semanas_bono_sin_caducidad),
  };
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarApertura(sesion.rol)) return NextResponse.json({ visible: false });

  const admin = requireSupabaseAdmin();
  const { studioId } = sesion;
  const now = new Date();

  const [studioR, progresoR, configR, asistenciaR] = await Promise.all([
    admin.from('studios').select('fecha_apertura, creado_en').eq('id', studioId).maybeSingle(),
    admin.from('opening_progreso').select('fase').eq('studio_id', studioId).maybeSingle(),
    admin.from('opening_config').select('*').eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('id').eq('studio_id', studioId).eq('estado', 'ASISTIDA').limit(1),
  ]);
  const errorBase = studioR.error ?? progresoR.error ?? configR.error ?? asistenciaR.error;
  if (errorBase || !studioR.data) {
    console.error('[opening:get] base', errorBase);
    return NextResponse.json({ error: 'No se pudo cargar la apertura' }, { status: 500 });
  }

  const fechaApertura = (studioR.data.fecha_apertura as string | null) ?? null;
  const fase = (progresoR.data?.fase as string | undefined) ?? null;
  const estado = {
    fechaApertura, fase,
    estudioCreadoEn: studioR.data.creado_en as string | null,
    tieneAsistencias: (asistenciaR.data?.length ?? 0) > 0,
  };
  if (!debeMostrarApertura(estado, now)) {
    return NextResponse.json({ visible: false });
  }

  const config = configDesdeFila(configR.data);
  const hasta = new Date(now.getTime() + config.ventanaAnalisisDias * 86_400_000).toISOString();

  const [sesionesR, suscripcionesR, planesR, leadsR] = await Promise.all([
    admin.from('sesiones').select('inicio, aforo_maximo, cancelada')
      .eq('studio_id', studioId).gte('inicio', now.toISOString()).lt('inicio', hasta).limit(5000),
    admin.from('suscripciones').select('socio_id, plan_id, estado, fecha_fin, sesiones_restantes')
      .eq('studio_id', studioId).eq('estado', 'ACTIVA').limit(5000),
    admin.from('planes_tarifa').select('id, tipo, sesiones, limite_semanal, validez_dias').eq('studio_id', studioId),
    admin.from('socios').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).is('borrado_en', null).in('lead_stage', ['LEAD', 'INTERESADA']),
  ]);
  const errorDatos = sesionesR.error ?? suscripcionesR.error ?? planesR.error ?? leadsR.error;
  if (errorDatos) {
    console.error('[opening:get] datos', errorDatos);
    return NextResponse.json({ error: 'No se pudo calcular la capacidad' }, { status: 500 });
  }

  const suscripciones: SuscripcionDemanda[] = (suscripcionesR.data ?? []).map(s => ({
    socioId: s.socio_id as string,
    planId: s.plan_id as string,
    estado: s.estado as EstadoSuscripcion,
    fechaFin: (s.fecha_fin as string | null) ?? null,
    sesionesRestantes: (s.sesiones_restantes as number | null) ?? null,
  }));

  // Asistencias solo de las socias con cuota activa, paginadas: PostgREST corta
  // en 1000 filas y un corte silencioso bajaría la frecuencia observada.
  const socioIds = [...new Set(suscripciones.map(s => s.socioId))];
  const asistidasPorSocio = new Map<string, AsistidaDemanda[]>();
  if (socioIds.length > 0) {
    const desde = new Date(now.getTime() - DIAS_HISTORIAL_ASISTENCIA * 86_400_000).toISOString();
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error } = await admin.from('reservas').select('socio_id, creado_en')
        .eq('studio_id', studioId).eq('estado', 'ASISTIDA').in('socio_id', socioIds)
        .gte('creado_en', desde).order('creado_en', { ascending: false })
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (error) {
        console.error('[opening:get] asistidas', error);
        return NextResponse.json({ error: 'No se pudo calcular la capacidad' }, { status: 500 });
      }
      for (const r of data ?? []) {
        const lista = asistidasPorSocio.get(r.socio_id as string) ?? [];
        lista.push({ creadoEn: r.creado_en as string });
        asistidasPorSocio.set(r.socio_id as string, lista);
      }
      if (!data || data.length < PAGINA) break;
    }
  }

  const analisis = analizarCapacidad({
    sesiones: (sesionesR.data ?? []).map(s => ({
      inicio: s.inicio as string, aforoMaximo: Number(s.aforo_maximo), cancelada: Boolean(s.cancelada),
    })),
    suscripciones,
    planes: (planesR.data ?? []).map(p => ({
      id: p.id as string,
      tipo: p.tipo as TipoPlan,
      sesiones: (p.sesiones as number | null) ?? null,
      limiteSemanal: (p.limite_semanal as number | null) ?? null,
      validezDias: (p.validez_dias as number | null) ?? null,
    }) satisfies PlanDemanda),
    leads: leadsR.count ?? 0,
    asistidasPorSocio,
    config,
    now,
  });

  return NextResponse.json({
    visible: true,
    fechaApertura,
    diasHastaApertura: diasHastaApertura(fechaApertura, now),
    fase,
    analisis,
    supuestos: {
      sesionesSemanaSinTope: config.sesionesSemanaSinTope,
      semanasBonoSinCaducidad: config.semanasBonoSinCaducidad,
      conversionLeads: config.conversionLeads,
    },
  });
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// El ida y vuelta por Date descarta días que no existen (2026-02-31 se
// desplazaría a marzo en vez de fallar).
function esFechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !FECHA.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return false;
  const anio = d.getUTCFullYear();
  return anio >= 2000 && anio <= 2100;
}

// PATCH { fechaApertura: 'YYYY-MM-DD' } fija la fecha; { yaAbierto: true } la
// oculta para siempre (fase OPERANDO).
export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarApertura(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const body = await req.json().catch(() => null) as { fechaApertura?: unknown; yaAbierto?: unknown } | null;
  const admin = requireSupabaseAdmin();
  const { studioId } = sesion;

  if (body?.yaAbierto === true) {
    const { error } = await admin.from('opening_progreso')
      .upsert({ studio_id: studioId, fase: 'OPERANDO', updated_at: new Date().toISOString() }, { onConflict: 'studio_id' });
    if (error) {
      console.error('[opening:patch] ya abierto', error);
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const fecha = body?.fechaApertura;
  if (!esFechaValida(fecha)) {
    return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 });
  }
  const { data, error } = await admin.from('studios').update({ fecha_apertura: fecha })
    .eq('id', studioId).select('fecha_apertura').maybeSingle();
  if (error || !data) {
    console.error('[opening:patch] fecha', error);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, fechaApertura: data.fecha_apertura });
}
