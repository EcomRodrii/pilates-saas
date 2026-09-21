import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarApertura, puedeVer } from '@/lib/permisos-reglas';
import { debeMostrarApertura, diasHastaApertura } from '@/lib/opening/visibilidad';
import { cargarAlertasAbiertas, cargarAnalisis, cargarEstadoApertura, PREFIJO_CUPO_SUPERADO } from '@/lib/opening/servidor';
import { evaluarAlertasApertura } from '@/lib/opening/alertas-cron';
import { ajustesDesdeConfig, validarAjustes } from '@/lib/opening/ajustes';
import { recomendar, validarOnboarding } from '@/lib/opening/onboarding';

// Opening OS en la home: fecha de apertura, capacidad frente a demanda y las
// alertas (lib/opening/alertas-cron.ts; el cron horario es quien notifica).
//
// ⚠️ Cliente service-role: la RLS NO filtra aquí. El rol se comprueba con el
// mismo criterio que la RLS de las tablas opening_* (puedeGestionarApertura) y
// TODA consulta va acotada a `studio_id` (lib/opening/servidor.ts).
//
// Coste: un estudio que ya opera hace 4 lecturas mínimas y sale con
// `{ visible: false }`; el análisis completo solo corre mientras se abre.

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarApertura(sesion.rol)) return NextResponse.json({ visible: false });

  const admin = requireSupabaseAdmin();
  const { studioId } = sesion;
  const now = new Date();

  try {
    const estado = await cargarEstadoApertura(admin, studioId);
    if (!estado) return NextResponse.json({ error: 'No se pudo cargar la apertura' }, { status: 500 });
    if (!debeMostrarApertura(estado, now)) return NextResponse.json({ visible: false });

    const { config, fechaApertura, fase } = estado;
    const analisis = await cargarAnalisis(admin, studioId, config, now);
    // Recalculadas al abrir: una alerta ya resuelta (p. ej. acaba de publicar su
    // horario) no puede seguir en pantalla hasta la siguiente pasada del cron.
    // Aquí solo se RESUELVEN: abrirlas y notificarlas es del cron, o gerencia
    // abriendo la home dejaría a la propietaria sin su aviso.
    const { detectadas, etapas, planes } = await evaluarAlertasApertura(admin, studioId, estado, analisis, now, { abrirNuevas: false });
    // Más los avisos que abre la propia BD (cupo superado): no los detecta
    // detectarAlertas, pero la bandeja los cuenta y tienen que verse aquí.
    const deLaBD = (await cargarAlertasAbiertas(admin, studioId)).filter(a => a.tipo.startsWith(PREFIJO_CUPO_SUPERADO));
    const alertas = [...detectadas, ...deLaBD];
    const recomendaciones = recomendar({
      respuestas: estado.respuestas,
      hayClasesPublicadas: analisis.sesionesEnVentana > 0,
      alertas: alertas.map(a => a.tipo),
      hayPlanes: planes.some(p => p.activo),
      hayEtapaFundadora: etapas.some(e => e.etapa === 'FUNDADORA'),
      puedeVer: href => puedeVer(sesion.rol, href),
    });
    return NextResponse.json({
      visible: true,
      fechaApertura,
      diasHastaApertura: diasHastaApertura(fechaApertura, now),
      fase,
      analisis,
      alertas: alertas.map(({ tipo, severidad, titulo, descripcion, href }) => ({ tipo, severidad, titulo, descripcion, href })),
      ajustes: ajustesDesdeConfig(config),
      onboarding: estado.respuestas,
      recomendaciones,
      supuestos: {
        sesionesSemanaSinTope: config.sesionesSemanaSinTope,
        semanasBonoSinCaducidad: config.semanasBonoSinCaducidad,
        conversionLeads: config.conversionLeads,
      },
    });
  } catch (e) {
    console.error('[opening:get]', e);
    return NextResponse.json({ error: 'No se pudo calcular la apertura' }, { status: 500 });
  }
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

// PATCH { yaAbierto: true } la oculta para siempre (fase OPERANDO);
// { onboarding } guarda las respuestas y la fecha (o la quita, «no lo sé»). Si no:
// { fechaApertura?: 'YYYY-MM-DD', ajustes?: AjustesApertura }, al menos uno.
// Se valida todo antes de escribir nada.
export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarApertura(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const body = await req.json().catch(() => null) as { fechaApertura?: unknown; yaAbierto?: unknown; ajustes?: unknown; onboarding?: unknown } | null;
  const admin = requireSupabaseAdmin();
  const { studioId } = sesion;
  const ahora = new Date().toISOString();

  if (body?.yaAbierto === true) {
    const { error } = await admin.from('opening_progreso')
      .upsert({ studio_id: studioId, fase: 'OPERANDO', updated_at: ahora }, { onConflict: 'studio_id' });
    if (error) {
      console.error('[opening:patch] ya abierto', error);
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.onboarding !== undefined) {
    const v = validarOnboarding(body.onboarding);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const { error: e1 } = await admin.from('opening_progreso')
      .upsert({ studio_id: studioId, fase: v.fase, objetivos: v.respuestas, updated_at: ahora }, { onConflict: 'studio_id' });
    if (e1) {
      console.error('[opening:patch] onboarding', e1);
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
    const { data, error: e2 } = await admin.from('studios').update({ fecha_apertura: v.fechaApertura })
      .eq('id', studioId).select('id').maybeSingle();
    if (e2 || !data) {
      console.error('[opening:patch] onboarding fecha', e2);
      return NextResponse.json({ error: 'No se pudo guardar la fecha' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const hayFecha = body?.fechaApertura !== undefined;
  const hayAjustes = body?.ajustes !== undefined;
  if (!hayFecha && !hayAjustes) return NextResponse.json({ error: 'Nada que guardar' }, { status: 400 });
  if (hayFecha && !esFechaValida(body!.fechaApertura)) {
    return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 });
  }
  const ajustes = hayAjustes ? validarAjustes(body!.ajustes) : null;
  if (ajustes && !ajustes.ok) return NextResponse.json({ error: ajustes.error }, { status: 400 });

  if (ajustes?.ok) {
    const { error } = await admin.from('opening_config')
      .upsert({ studio_id: studioId, ...ajustes.fila, updated_at: ahora }, { onConflict: 'studio_id' });
    if (error) {
      console.error('[opening:patch] ajustes', error);
      return NextResponse.json({ error: 'No se pudieron guardar los ajustes' }, { status: 500 });
    }
  }
  if (hayFecha) {
    const { data, error } = await admin.from('studios').update({ fecha_apertura: body!.fechaApertura })
      .eq('id', studioId).select('fecha_apertura').maybeSingle();
    if (error || !data) {
      console.error('[opening:patch] fecha', error);
      return NextResponse.json({ error: 'No se pudo guardar la fecha' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
