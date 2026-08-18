import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { tieneFeature } from '@/lib/billing/entitlements';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  dbListPendientes, dbGetResumenDiarioReciente, dbGetMensajeDia, dbListMensajesRecientes,
  dbGetRecomendacion, dbListOutcomesRecientes, dbCountAutonomasHoy,
} from '@/lib/decision/db';
import { calcularEstadoEspecialista } from '@/lib/decision/director';
import { seleccionarPrioridadesHome } from '@/lib/decision/prioridad';
import { fraseConfianza } from '@/lib/decision/copy';
import type { EspecialistaId, Impacto, Recomendacion } from '@/lib/decision/tipos';
import type { ActividadReciente } from '@/lib/types';

// GET /api/decisiones — resumen del día + prioridades + estado por
// especialista + actividad reciente (DECISION-OS-ARQUITECTURA.md §7).
// MVP: solo PROPIETARIO (DECISION-OS-ANALISIS.md §8, corregido en revisión).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data: studio } = await requireSupabaseAdmin().from('studios').select('plan, subscription_status').eq('id', sesion.studioId).single();
  if (!studio || !tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscription_status }, 'decisiones')) {
    return NextResponse.json({ error: 'Tu plan no incluye el Centro de Control' }, { status: 403 });
  }

  const now = new Date();
  const fechaHoy = now.toISOString().slice(0, 10);
  const [resumen, pendientes, actividadRes, mensajeHoy, mensajesRecientes, outcomesRecientes, nAutonomasHoy] = await Promise.all([
    dbGetResumenDiarioReciente(sesion.studioId, now),
    dbListPendientes(sesion.studioId),
    requireSupabaseAdmin().from('actividad_reciente').select('*').eq('studio_id', sesion.studioId).order('creado_en', { ascending: false }).limit(10),
    dbGetMensajeDia(sesion.studioId, fechaHoy),
    dbListMensajesRecientes(sesion.studioId, now, 7),
    dbListOutcomesRecientes(sesion.studioId, 3),
    dbCountAutonomasHoy(sesion.studioId, now),
  ]);

  // El Umbral (lib/decision/umbral.ts): el veredicto del día es el elemento
  // principal de la pantalla — construido a partir de `decision_mensajes_dia`,
  // no de la lista completa de pendientes.
  const recomendacionGanadora = mensajeHoy?.tipo === 'MENSAJE' && mensajeHoy.recomendacionId
    ? await dbGetRecomendacion(mensajeHoy.recomendacionId)
    : null;
  const semanaTranquila = mensajesRecientes.length >= 5 && mensajesRecientes.every(m => m.tipo === 'SILENCIO');
  const veredicto = {
    tipo: mensajeHoy?.tipo ?? ('SIN_ANALIZAR' as const),
    recomendacion: recomendacionGanadora,
    fraseConfianza: recomendacionGanadora ? fraseConfianza(recomendacionGanadora.confianza.nivel) : null,
    semanaTranquila,
  };
  const seguimiento = outcomesRecientes.map(o => ({
    outcome: o.outcome, tipo: o.recomendacionTipo, titulo: o.recomendacionTitulo,
    socioId: o.socioId, medidoEn: o.medidoEn,
  }));

  // Mismo score+prioridad ya persistidos por el análisis; aquí solo se
  // selecciona qué cabe en el bloque Prioridades (≤3, ≤2/especialista).
  const prioridades = seleccionarPrioridadesHome(pendientes);
  // El resto de situaciones detectadas (MEDIA/BAJA, o las que no cupieron en el
  // cap de Prioridades) también deben ser ACCIONABLES: antes solo se contaban en
  // "Mi Equipo" pero no se mostraban en ningún sitio, así que un especialista con
  // "7 situaciones pendientes" no dejaba ver NINGUNA. Se devuelven ordenadas por
  // score para pintarlas como tarjetas bajo Prioridades.
  const idsPrioridad = new Set(prioridades.map(r => r.id));
  const masSituaciones = pendientes
    .filter(r => !idsPrioridad.has(r.id))
    .sort((a, b) => b.score - a.score);

  // Sembrado con los especialistas MVP activos (ESPECIALISTAS en
  // lib/decision/especialistas/contrato.ts): un especialista con 0 pendientes
  // igual muestra su tarjeta ("todo en orden"), no desaparece de Mi Equipo.
  const porEspecialistaMap = new Map<EspecialistaId, Recomendacion[]>([
    ['RETENCION', []], ['INGRESOS', []], ['AGENDA', []], ['CAPTACION', []],
    ['FINANZAS', []], ['MARKETING', []], ['EQUIPO', []], ['ONBOARDING', []],
  ]);
  for (const r of pendientes) {
    const arr = porEspecialistaMap.get(r.especialista) ?? [];
    arr.push(r);
    porEspecialistaMap.set(r.especialista, arr);
  }
  const porEspecialista = [...porEspecialistaMap.entries()].map(([especialista, recs]) => {
    const eurMesDe = (imp: Impacto) => (imp.unidad === 'EUR' ? imp.valor / 3 : imp.valor);
    const valorTotal = recs.reduce((acc, r) => acc + (r.impacto ? eurMesDe(r.impacto) : 0), 0);
    const impactoTotal: Impacto | null = valorTotal > 0
      ? { valor: Math.round(valorTotal * 100) / 100, unidad: 'EUR_MES', formula: '' }
      : null;
    return { especialista, pendientes: recs.length, impactoTotal, estado: calcularEstadoEspecialista(recs) };
  });

  // Mapeo manual snake_case→camelCase: mapActividadReciente() vive privado en
  // supabase-data.ts, no se exporta (Arquitectura §5 — este módulo no lo toca).
  const actividad: ActividadReciente[] = (actividadRes.data ?? []).map(r => ({
    id: r.id, studioId: r.studio_id, tipo: r.tipo, texto: r.texto,
    socioId: r.socio_id ?? null, enlace: r.enlace ?? null, creadoEn: r.creado_en,
    actorNombre: r.actor_nombre ?? null,
  }));

  return NextResponse.json({
    resumen,
    veredicto,
    seguimiento,
    prioridades,
    masSituaciones,
    porEspecialista,
    actividad,
    // Reorganización Centro de Control §1: cuenta lo que el piloto automático
    // ya resolvió hoy sin esperar criterio — reusa dbCountAutonomasHoy (ya
    // existía para el cupo diario del piloto, sin caller aquí hasta ahora).
    nAutonomasHoy,
  });
}
