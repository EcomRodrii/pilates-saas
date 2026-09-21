import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '../utils.ts';
import type { Rol } from '@/lib/types';
import {
  calcularLiquidacion, minutosContratoMes, type ModoLiquidacion, type RelacionLaboral, type SesionParaLiquidacion,
} from './liquidacion-logic.ts';
import { rangoMesEstudio } from '../fichaje/jornadas-equipo.ts';
import { estadoDeClase, retrasoMinutos, type FilaClase, type Tramo } from '../fichaje/clases-impartidas.ts';

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
  relacionLaboral: RelacionLaboral;
  clasesSinConfirmar: number;
  clasesNoDadas: number;
  minutosRetraso: number;
  minutosContrato: number | null;
  minutosExtra: number | null;
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
    relacionLaboral: r.relacion_laboral === 'CONTRATADA' || r.relacion_laboral === 'AUTONOMA' ? r.relacion_laboral : null,
    clasesSinConfirmar: Number(r.clases_sin_confirmar ?? 0),
    clasesNoDadas: Number(r.clases_no_dadas ?? 0),
    minutosRetraso: Number(r.minutos_retraso ?? 0),
    minutosContrato: r.minutos_contrato == null ? null : Number(r.minutos_contrato),
    minutosExtra: r.minutos_extra == null ? null : Number(r.minutos_extra),
  };
}

export interface CriterioLiquidacion { modo: ModoLiquidacion; pagarDuracionReal: boolean }

/**
 * Cómo liquida este estudio: con qué calcula la parte variable y si las clases
 * dadas se pagan por su horario (por defecto) o por lo que duraron de verdad.
 * Sin fila de configuración: por clases y por horario.
 */
export async function criterioLiquidacionEstudio(admin: SupabaseClient, studioId: string): Promise<CriterioLiquidacion> {
  const { data, error } = await admin.from('studio_config_tiempo').select('liquidar_por, pagar_duracion_real').eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  const f = data as { liquidar_por?: string; pagar_duracion_real?: boolean } | null;
  return { modo: f?.liquidar_por === 'HORAS_FICHADAS' ? 'HORAS_FICHADAS' : 'CLASES', pagarDuracionReal: f?.pagar_duracion_real === true };
}

/**
 * Lo fichado por una instructora en el periodo: minutos de jornadas CERRADAS y
 * cuántas siguen abiertas o por revisar. Cuenta en el mes en que empezó cada
 * jornada, igual que «Tiempo trabajado». Un error lanza: pagar 0 h por no haber
 * podido leer es peor que no generar el borrador.
 */
async function fichajeDelPeriodo(
  admin: SupabaseClient, studioId: string, instructorId: string, desde: string, hasta: string,
): Promise<{ minutosCerrados: number; jornadasSinCerrar: number; tramos: Tramo[] }> {
  const { data, error } = await admin.from('instructor_work_sessions')
    .select('check_in_at, check_out_at, status')
    .eq('studio_id', studioId).eq('instructor_id', instructorId)
    .gte('check_in_at', desde).lt('check_in_at', hasta);
  if (error) throw error;
  let minutosCerrados = 0;
  let jornadasSinCerrar = 0;
  const tramos: Tramo[] = [];
  for (const j of (data ?? []) as { check_in_at: string; check_out_at: string | null; status: string }[]) {
    tramos.push({ desde: j.check_in_at, hasta: j.check_out_at });
    if (j.status === 'CLOSED' && j.check_out_at) {
      minutosCerrados += Math.round((Date.parse(j.check_out_at) - Date.parse(j.check_in_at)) / 60_000);
    } else {
      jornadasSinCerrar++;
    }
  }
  return { minutosCerrados, jornadasSinCerrar, tramos };
}

/**
 * Qué se sabe de si dio cada clase del mes (clases impartidas), con el mismo
 * criterio que su app y «Tiempo trabajado» (`estadoDeClase`). Solo DADA,
 * NO_DADA y SIN_CONFIRMAR cambian algo; el resto (anteriores a la función, aún
 * por llegar, en curso sin empezar) se paga por su horario como siempre.
 */
async function conControlDeClases(
  admin: SupabaseClient, studioId: string, instructorId: string,
  sesiones: { id: string; inicio: string; fin: string }[], tramos: Tramo[], relacion: RelacionLaboral, ahora: Date,
): Promise<SesionParaLiquidacion[]> {
  if (sesiones.length === 0) return [];
  const { data, error } = await admin.from('clases_impartidas')
    .select('sesion_id, estado, inicio_real, fin_real, origen')
    .eq('studio_id', studioId).eq('instructor_id', instructorId).in('sesion_id', sesiones.map((s) => s.id));
  if (error) throw error;
  const filas = new Map(((data ?? []) as FilaClase[]).map((f) => [f.sesion_id, f]));
  return sesiones.map((s) => {
    const fila = filas.get(s.id) ?? null;
    const { estado } = estadoDeClase({ ...s, cancelada: false, nombre: '' }, fila, tramos, relacion, ahora);
    if (estado === 'NO_DADA' || estado === 'SIN_CONFIRMAR') return { ...s, control: estado };
    if ((estado === 'DADA' || estado === 'EN_CURSO') && fila?.inicio_real) {
      const fin = Date.parse(fila.fin_real ?? s.fin);
      return {
        ...s, control: 'DADA',
        minutosReales: Math.max(0, Math.round((fin - Date.parse(fila.inicio_real)) / 60_000)),
        retrasoMin: retrasoMinutos({ ...s, cancelada: false, nombre: '' }, fila),
      };
    }
    // Dada por su jornada (contratada) o sin nada que decir: su horario.
    return estado === 'DADA' ? { ...s, control: 'DADA' } : s;
  });
}

/**
 * Genera (o recalcula) el BORRADOR de liquidación de una instructora para un
 * mes. Idempotente vía upsert (unique instructor_id+periodo). Rechaza si la
 * liquidación de ese periodo ya está CONFIRMADA/PAGADA — no se pisa un
 * documento que la instructora ya pudo haber visto.
 */
export async function generarLiquidacionBorrador(
  admin: SupabaseClient, studioId: string, instructorId: string, anio: number, mes: number, ahora = new Date(),
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
    admin.from('instructor_tarifas').select('tarifa_hora, base_mensual_eur, recargo_sustitucion_pct, relacion_laboral, horas_semanales_contrato')
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
  const relacionRaw = (tarifaRow as { relacion_laboral?: string | null } | null)?.relacion_laboral;
  const relacion: RelacionLaboral = relacionRaw === 'CONTRATADA' || relacionRaw === 'AUTONOMA' ? relacionRaw : null;

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

  // Criterio del estudio, jornadas y clases impartidas: si algo no se puede leer,
  // no se genera — pagar por lo que no se ha podido comprobar es peor que esperar.
  let criterio: { modo: ModoLiquidacion; pagarDuracionReal: boolean };
  let fichaje: { minutosCerrados: number; jornadasSinCerrar: number; tramos: Tramo[] } | undefined;
  let sesionesPropias: SesionParaLiquidacion[];
  let sesionesSustitucion: SesionParaLiquidacion[];
  try {
    criterio = await criterioLiquidacionEstudio(admin, studioId);
    // La autónoma no ficha: ni se paga por jornada ni una jornada «cubre» sus clases.
    if (relacion !== 'AUTONOMA') fichaje = await fichajeDelPeriodo(admin, studioId, instructorId, desde, hasta);
    const controladas = await conControlDeClases(admin, studioId, instructorId, sesiones, fichaje?.tramos ?? [], relacion, ahora);
    sesionesPropias = controladas.filter(s => !sesionesSustitucionIds.has(s.id));
    sesionesSustitucion = controladas.filter(s => sesionesSustitucionIds.has(s.id));
  } catch {
    return { error: 'No se han podido leer el fichaje o las clases del mes. Inténtalo de nuevo.' };
  }
  const horasContrato = (tarifaRow as { horas_semanales_contrato?: number | string | null } | null)?.horas_semanales_contrato;

  const calculo = calcularLiquidacion({
    modo: criterio.modo, fichaje, relacion, pagarDuracionReal: criterio.pagarDuracionReal,
    minutosContrato: minutosContratoMes(horasContrato == null ? null : Number(horasContrato)),
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
    relacion_laboral: calculo.relacion, clases_sin_confirmar: calculo.clasesSinConfirmar, clases_no_dadas: calculo.clasesNoDadas,
    minutos_retraso: calculo.minutosRetraso, minutos_contrato: calculo.minutosContrato, minutos_extra: calculo.minutosExtra,
    detalle: calculo.detalle, estado: 'BORRADOR', generada_en: new Date().toISOString(),
  }, { onConflict: 'instructor_id,periodo_anio,periodo_mes' }).select().maybeSingle();

  if (error || !upserted) return { error: error?.message ?? 'No se ha podido generar la liquidación' };
  return { row: mapRow(upserted) };
}

export async function transicionarLiquidacion(
  admin: SupabaseClient, id: string, studioId: string,
  accion: 'confirmar' | 'marcar_pagada', actorUserId: string, referenciaPago?: string | null, ahora = new Date(),
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
      actual.periodo_anio as number, actual.periodo_mes as number, ahora,
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
    // Una clase sin confirmar se ha pagado por su horario a ciegas: primero se
    // sabe si la dio (ella desde su app, o quien gestiona desde Tiempo trabajado).
    if (recalculado.row.clasesSinConfirmar > 0) {
      const n = recalculado.row.clasesSinConfirmar;
      return { error: `${n === 1 ? 'Hay una clase' : `Hay ${n} clases`} de este mes sin confirmar si se dieron. Revísalas en Tiempo trabajado antes de confirmar.` };
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
