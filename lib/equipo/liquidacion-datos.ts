import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '../utils.ts';
import type { Rol } from '@/lib/types';
import { calcularLiquidacion, type ModoLiquidacion, type SesionParaLiquidacion } from './liquidacion-logic.ts';
import { rangoMesEstudio } from '../fichaje/jornadas-equipo.ts';

// Capa de datos server-only para la liquidación de instructoras (fila 11 del
// informe estratégico). Separada de lib/supabase-data.ts (god file, no
// trocear — regla del repo) a propósito: es funcionalidad nueva y acotada,
// no una extensión de algo que ya vivía ahí.

export interface LiquidacionRow {
  id: string;
  instructorId: string;
  periodoAnio: number;
  periodoMes: number;
  baseEur: number;
  nClasesPropias: number;
  variablePropiasEur: number;
  nClasesSustitucion: number;
  variableSustitucionEur: number;
  nPenalizaciones: number;
  repartoPenalizacionesEur: number;
  nClasesSinTarifa: number;
  totalEur: number;
  estado: 'BORRADOR' | 'CONFIRMADA' | 'PAGADA';
  confirmadaEn: string | null;
  pagadaEn: string | null;
  referenciaPago: string | null;
  generadaEn: string;
  requiereRevision: boolean;
  revisionMotivo: string | null;
  modo: ModoLiquidacion;
  minutosFichados: number | null;
  jornadasSinCerrar: number;
}

function mapRow(r: Record<string, unknown>): LiquidacionRow {
  return {
    id: r.id as string,
    instructorId: r.instructor_id as string,
    periodoAnio: r.periodo_anio as number,
    periodoMes: r.periodo_mes as number,
    baseEur: Number(r.base_eur),
    nClasesPropias: r.n_clases_propias as number,
    variablePropiasEur: Number(r.variable_propias_eur),
    nClasesSustitucion: r.n_clases_sustitucion as number,
    variableSustitucionEur: Number(r.variable_sustitucion_eur),
    nPenalizaciones: r.n_penalizaciones as number,
    repartoPenalizacionesEur: Number(r.reparto_penalizaciones_eur),
    nClasesSinTarifa: r.n_clases_sin_tarifa as number,
    totalEur: Number(r.total_eur),
    estado: r.estado as LiquidacionRow['estado'],
    confirmadaEn: (r.confirmada_en as string | null) ?? null,
    pagadaEn: (r.pagada_en as string | null) ?? null,
    referenciaPago: (r.referencia_pago as string | null) ?? null,
    generadaEn: r.generada_en as string,
    requiereRevision: (r.requiere_revision as boolean | null) ?? false,
    revisionMotivo: (r.revision_motivo as string | null) ?? null,
    modo: r.modo === 'HORAS_FICHADAS' ? 'HORAS_FICHADAS' : 'CLASES',
    minutosFichados: r.minutos_fichados == null ? null : Number(r.minutos_fichados),
    jornadasSinCerrar: Number(r.jornadas_sin_cerrar ?? 0),
  };
}

/** Con qué calcula este estudio la parte variable. Sin fila de configuración: por clases. */
export async function modoLiquidacionEstudio(admin: SupabaseClient, studioId: string): Promise<ModoLiquidacion> {
  const { data, error } = await admin.from('studio_config_tiempo').select('liquidar_por').eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  return (data as { liquidar_por?: string } | null)?.liquidar_por === 'HORAS_FICHADAS' ? 'HORAS_FICHADAS' : 'CLASES';
}

/**
 * Lo fichado por una instructora en el periodo: minutos de jornadas CERRADAS y
 * cuántas siguen abiertas o por revisar. Cuenta en el mes en que empezó cada
 * jornada, igual que «Tiempo trabajado». Un error lanza: pagar 0 h por no haber
 * podido leer es peor que no generar el borrador.
 */
async function fichajeDelPeriodo(
  admin: SupabaseClient, studioId: string, instructorId: string, desde: string, hasta: string,
): Promise<{ minutosCerrados: number; jornadasSinCerrar: number }> {
  const { data, error } = await admin.from('instructor_work_sessions')
    .select('check_in_at, check_out_at, status')
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .gte('check_in_at', desde).lt('check_in_at', hasta);
  if (error) throw error;
  let minutosCerrados = 0;
  let jornadasSinCerrar = 0;
  for (const j of (data ?? []) as { check_in_at: string; check_out_at: string | null; status: string }[]) {
    if (j.status === 'CLOSED' && j.check_out_at) {
      minutosCerrados += Math.round((Date.parse(j.check_out_at) - Date.parse(j.check_in_at)) / 60_000);
    } else {
      jornadasSinCerrar++;
    }
  }
  return { minutosCerrados, jornadasSinCerrar };
}

/**
 * Genera (o recalcula) el BORRADOR de liquidación de una instructora para un
 * mes. Idempotente vía upsert (unique instructor_id+periodo). Rechaza si la
 * liquidación de ese periodo ya está CONFIRMADA/PAGADA — no se pisa un
 * documento que la instructora ya pudo haber visto.
 */
export async function generarLiquidacionBorrador(
  admin: SupabaseClient, studioId: string, instructorId: string, anio: number, mes: number,
): Promise<{ row?: LiquidacionRow; error?: string }> {
  const { data: existente } = await admin
    .from('liquidaciones_instructoras').select('id, estado')
    .eq('studio_id', studioId).eq('instructor_id', instructorId).eq('periodo_anio', anio).eq('periodo_mes', mes)
    .maybeSingle();
  if (existente && existente.estado !== 'BORRADOR') {
    return { error: `Esta liquidación ya está ${existente.estado === 'CONFIRMADA' ? 'confirmada' : 'pagada'} — reabre el proceso antes de recalcular` };
  }

  // El mes a medianoche de Madrid, no de UTC: con `Date.UTC` una clase (o una
  // penalización cobrada) entre las 00:00 y la 01:59 del día 1 caía en la
  // liquidación del mes anterior. Mismo rango que «Tiempo trabajado».
  const rango = rangoMesEstudio(anio, mes);
  if (!rango) return { error: 'Periodo no válido' };
  const { desde, hasta } = rango;

  const [{ data: tarifaRow }, { data: sesionesRow }, { data: sustitucionesRow }, { data: studioRow }] = await Promise.all([
    admin.from('instructor_tarifas').select('tarifa_hora, base_mensual_eur, recargo_sustitucion_pct')
      .eq('instructor_id', instructorId).eq('studio_id', studioId).maybeSingle(),
    admin.from('sesiones').select('id, inicio, fin')
      .eq('studio_id', studioId).eq('instructor_id', instructorId).eq('cancelada', false)
      .gte('inicio', desde).lt('inicio', hasta),
    admin.from('sustituciones').select('sesion_id')
      .eq('studio_id', studioId).eq('sustituta_final_id', instructorId).eq('estado', 'confirmada'),
    admin.from('studios').select('instructor_reparto_penalizacion_pct').eq('id', studioId).maybeSingle(),
  ]);

  const sesiones = (sesionesRow ?? []) as { id: string; inicio: string; fin: string }[];
  const sesionesSustitucionIds = new Set((sustitucionesRow ?? []).map(r => r.sesion_id as string));
  const sesionesPropias: SesionParaLiquidacion[] = sesiones.filter(s => !sesionesSustitucionIds.has(s.id));
  const sesionesSustitucion: SesionParaLiquidacion[] = sesiones.filter(s => sesionesSustitucionIds.has(s.id));

  // Penalizaciones cobradas en el periodo cuya reserva pertenece a una
  // sesión de esta instructora — join en dos pasos porque supabase-js no
  // cruza tablas por columna cruda sin una FK-embed declarada.
  const { data: penalizacionesRow } = await admin
    .from('penalizaciones').select('importe, reserva_id')
    .eq('studio_id', studioId).eq('estado', 'COBRADA')
    .gte('procesada_en', desde).lt('procesada_en', hasta);
  let penalizacionesCobradasEur: number[] = [];
  if (penalizacionesRow && penalizacionesRow.length > 0) {
    const reservaIds = penalizacionesRow.map(p => p.reserva_id as string);
    const { data: reservasRow } = await admin.from('reservas').select('id, sesion_id').in('id', reservaIds);
    const sesionIdPorReserva = new Map((reservasRow ?? []).map(r => [r.id as string, r.sesion_id as string | null]));
    // ⚠️ Acotado a las sesiones que de verdad hacen falta (las de estas
    // penalizaciones), no a todas las del estudio. Antes leía
    // `sesiones` entero sin paginar: PostgREST corta en 1000 filas en
    // silencio, así que a partir de ~1 año de actividad (20 clases/semana)
    // la sesión de la penalización podía no venir en esas 1000 y la
    // penalización NO se le imputaba a la instructora. Es nómina, y fallaba
    // sin ruido. Esta versión es además más rápida: lee un puñado de filas
    // por id en vez de escanear el estudio entero.
    const sesionIds = [...new Set([...sesionIdPorReserva.values()].filter((id): id is string => !!id))];
    const { data: sesionesTodasRow } = sesionIds.length === 0
      ? { data: [] }
      : await admin.from('sesiones').select('id, instructor_id')
          .eq('studio_id', studioId).in('id', sesionIds);
    const instructorPorSesion = new Map((sesionesTodasRow ?? []).map(s => [s.id as string, s.instructor_id as string | null]));
    penalizacionesCobradasEur = penalizacionesRow
      .filter(p => instructorPorSesion.get(sesionIdPorReserva.get(p.reserva_id as string) ?? '') === instructorId)
      .map(p => Number(p.importe));
  }

  let modo: ModoLiquidacion;
  let fichaje: { minutosCerrados: number; jornadasSinCerrar: number } | undefined;
  try {
    modo = await modoLiquidacionEstudio(admin, studioId);
    if (modo === 'HORAS_FICHADAS') fichaje = await fichajeDelPeriodo(admin, studioId, instructorId, desde, hasta);
  } catch {
    return { error: 'No se ha podido leer el fichaje del mes. Inténtalo de nuevo.' };
  }

  const calculo = calcularLiquidacion({
    modo, fichaje,
    sesionesPropias, sesionesSustitucion, penalizacionesCobradasEur,
    tarifa: {
      tarifaHora: tarifaRow?.tarifa_hora == null ? null : Number(tarifaRow.tarifa_hora),
      baseMensualEur: tarifaRow?.base_mensual_eur == null ? null : Number(tarifaRow.base_mensual_eur),
      recargoSustitucionPct: tarifaRow?.recargo_sustitucion_pct == null ? null : Number(tarifaRow.recargo_sustitucion_pct),
    },
    repartoPenalizacionPct: studioRow?.instructor_reparto_penalizacion_pct == null ? null : Number(studioRow.instructor_reparto_penalizacion_pct),
  });

  const { data: upserted, error } = await admin.from('liquidaciones_instructoras').upsert({
    id: existente?.id ?? `liq-${uid()}`,
    studio_id: studioId, instructor_id: instructorId, periodo_anio: anio, periodo_mes: mes,
    base_eur: calculo.baseEur,
    n_clases_propias: calculo.nClasesPropias, variable_propias_eur: calculo.variablePropiasEur,
    n_clases_sustitucion: calculo.nClasesSustitucion, variable_sustitucion_eur: calculo.variableSustitucionEur,
    n_penalizaciones: calculo.nPenalizaciones, reparto_penalizaciones_eur: calculo.repartoPenalizacionesEur,
    n_clases_sin_tarifa: calculo.nClasesSinTarifa,
    modo: calculo.modo, minutos_fichados: calculo.minutosFichados, jornadas_sin_cerrar: calculo.jornadasSinCerrar,
    detalle: calculo.detalle, estado: 'BORRADOR', generada_en: new Date().toISOString(),
  }, { onConflict: 'instructor_id,periodo_anio,periodo_mes' }).select().maybeSingle();

  if (error || !upserted) return { error: error?.message ?? 'No se ha podido generar la liquidación' };
  return { row: mapRow(upserted) };
}

export async function transicionarLiquidacion(
  admin: SupabaseClient, id: string, studioId: string,
  accion: 'confirmar' | 'marcar_pagada', actorUserId: string, referenciaPago?: string | null,
): Promise<{ row?: LiquidacionRow; error?: string }> {
  const { data: actual } = await admin.from('liquidaciones_instructoras')
    .select('id, estado, instructor_id, periodo_anio, periodo_mes')
    .eq('id', id).eq('studio_id', studioId).maybeSingle();
  if (!actual) return { error: 'Liquidación no encontrada' };

  if (accion === 'confirmar') {
    if (actual.estado !== 'BORRADOR') return { error: 'Solo se puede confirmar un borrador' };
    // 44ª pasada de auditoría, hallazgo #1: un BORRADOR generado días antes
    // puede incluir una clase cancelada después — recalcula contra el
    // estado ACTUAL de sesiones/sustituciones/penalizaciones antes de
    // confirmar, en vez de fiarse del último SELECT. Reutiliza
    // generarLiquidacionBorrador (idempotente, solo toca BORRADOR).
    const recalculado = await generarLiquidacionBorrador(
      admin, studioId, actual.instructor_id as string,
      actual.periodo_anio as number, actual.periodo_mes as number,
    );
    if (recalculado.error || !recalculado.row) {
      return { error: recalculado.error ?? 'No se pudo recalcular antes de confirmar' };
    }
    // Por horas fichadas, una jornada sin cerrar son horas que no se pagarían:
    // se corrige antes de confirmar, no después.
    if (recalculado.row.modo === 'HORAS_FICHADAS' && recalculado.row.jornadasSinCerrar > 0) {
      const n = recalculado.row.jornadasSinCerrar;
      return { error: `${n === 1 ? 'Hay una jornada' : `Hay ${n} jornadas`} de este mes sin cerrar. Corrígelas en Tiempo trabajado antes de confirmar.` };
    }
    // Compare-and-set (hallazgo #3): sin esto, dos PATCH casi simultáneos
    // podían superar ambos el chequeo en memoria de arriba.
    const { data, error } = await admin.from('liquidaciones_instructoras')
      .update({ estado: 'CONFIRMADA', confirmada_en: new Date().toISOString(), confirmada_por: actorUserId })
      .eq('id', id).eq('estado', 'BORRADOR').select().maybeSingle();
    if (error || !data) return { error: error?.message ?? 'No se ha podido confirmar' };
    return { row: mapRow(data) };
  }

  // marcar_pagada
  if (actual.estado !== 'CONFIRMADA') return { error: 'Solo se puede marcar como pagada una liquidación ya confirmada' };
  const { data, error } = await admin.from('liquidaciones_instructoras')
    .update({ estado: 'PAGADA', pagada_en: new Date().toISOString(), pagada_por: actorUserId, referencia_pago: referenciaPago ?? null })
    .eq('id', id).eq('estado', 'CONFIRMADA').select().maybeSingle();
  if (error || !data) return { error: error?.message ?? 'No se ha podido marcar como pagada' };
  return { row: mapRow(data) };
}

export async function listarLiquidaciones(
  admin: SupabaseClient, studioId: string, anio: number, mes: number,
): Promise<LiquidacionRow[]> {
  const { data } = await admin.from('liquidaciones_instructoras').select('*')
    .eq('studio_id', studioId).eq('periodo_anio', anio).eq('periodo_mes', mes);
  return (data ?? []).map(mapRow);
}

// Rol de cada ficha del estudio (activas o no), para filtrar los listados de
// retribución con `filtrarRetribucionVisible`. Si la consulta falla devuelve un
// mapa vacío: el filtro trata el rol desconocido como "no se ve" (falla cerrado).
export async function rolesPorInstructor(
  admin: SupabaseClient, studioId: string,
): Promise<Map<string, Rol>> {
  const { data, error } = await admin.from('instructores').select('id, rol').eq('studio_id', studioId);
  if (error) return new Map();
  return new Map((data ?? []).map(r => [r.id as string, r.rol as Rol]));
}

export async function obtenerLiquidacion(
  admin: SupabaseClient, studioId: string, instructorId: string, anio: number, mes: number,
): Promise<LiquidacionRow | null> {
  const { data } = await admin.from('liquidaciones_instructoras').select('*')
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .eq('periodo_anio', anio).eq('periodo_mes', mes).maybeSingle();
  return data ? mapRow(data) : null;
}
