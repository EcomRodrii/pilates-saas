// Adaptador de escritura/lectura (DECISION-OS-ARQUITECTURA.md §5,
// DECISION-OS-MODELO-DATOS.md §4). Mappers Row↔dominio + dbXxx de las 6
// tablas nuevas — server-only, NO engorda lib/supabase-data.ts. Mismo patrón
// de mappers (mapXxx/xxxToDb) y de errores (reportError) que ese archivo.
import { requireSupabaseAdmin } from '@/lib/supabase-admin';
import { uid } from '@/lib/utils';

// Decision OS escribe con el cliente service-role (salta RLS). Con el cliente
// anon, RLS bloqueaba silenciosamente todos los INSERT/UPSERT de estas tablas
// y las lecturas volvían vacías → el Centro de Control quedaba en "modo
// aprendizaje" pese a haber datos. Se resuelve una vez por llamada (cacheado).
function db() {
  return requireSupabaseAdmin();
}
import type {
  AccionDecision, Confianza, DecisionFeatureFlag, DecisionFlag, DecisionSession, EspecialistaId,
  EstadoRecomendacion, HechoMemoria, Impacto, ItemMientrasDormias, MemoriaEstudio, Outcome,
  Prioridad, Recomendacion, ResumenDiario, Riesgo, TipoRecomendacion,
} from './tipos.ts';
import type { NuevoHechoMemoria } from './memoria.ts';
import type { CandidataPriorizada } from './prioridad.ts';

function reportError(tag: string, error: unknown) {
  console.error(tag, error);
}

// ═══════════════════════════════════════════════════════════════════════════
// decision_sessions
// ═══════════════════════════════════════════════════════════════════════════

export async function dbInsertDecisionSession(input: {
  studioId: string; disparadoPor: DecisionSession['disparadoPor']; algorithmVersion: string; iniciadoEn: string;
}): Promise<string> {
  const id = uid();
  const { error } = await supabase.from('decision_sessions').insert({
    id, studio_id: input.studioId, disparado_por: input.disparadoPor,
    algorithm_version: input.algorithmVersion, iniciado_en: input.iniciadoEn,
  });
  if (error) reportError('[dbInsertDecisionSession]', error);
  return id;
}

export async function dbFinalizarDecisionSession(id: string, patch: {
  finalizadoEn: string; snapshotStats: Record<string, number>; nCandidatasGeneradas: number;
  nCandidatasDescartadas: number; nRecomendacionesPersistidas: number; resumenDiarioId: string | null;
  errores: string[] | null; estado: 'COMPLETADA' | 'FALLIDA';
}): Promise<void> {
  const { error } = await supabase.from('decision_sessions').update({
    finalizado_en: patch.finalizadoEn, snapshot_stats: patch.snapshotStats,
    n_candidatas_generadas: patch.nCandidatasGeneradas, n_candidatas_descartadas: patch.nCandidatasDescartadas,
    n_recomendaciones_persistidas: patch.nRecomendacionesPersistidas, resumen_diario_id: patch.resumenDiarioId,
    errores: patch.errores, estado: patch.estado,
  }).eq('id', id);
  if (error) reportError('[dbFinalizarDecisionSession]', error);
}

// ═══════════════════════════════════════════════════════════════════════════
// recomendaciones
// ═══════════════════════════════════════════════════════════════════════════

interface RowRecomendaciones {
  id: string; studio_id: string; decision_session_id: string; algorithm_version: string;
  especialista: string; tipo: string; dedupe_key: string; titulo: string; motivo: string;
  datos_usados: Record<string, unknown>; riesgo: string; impacto: Record<string, unknown> | null;
  confianza: Record<string, unknown>; score: number; prioridad: string; nivel_autonomia: number;
  accion: Record<string, unknown>; socio_id: string | null; sesion_id: string | null; recibo_id: string | null;
  tiempo_estimado_min: number; estado: string; vista_en: string | null; expira_en: string;
  creado_en: string; resuelto_en: string | null; resuelto_por: string | null;
}

function mapRecomendacion(row: RowRecomendaciones): Recomendacion {
  return {
    id: row.id, studioId: row.studio_id, decisionSessionId: row.decision_session_id,
    algorithmVersion: row.algorithm_version, especialista: row.especialista as EspecialistaId,
    tipo: row.tipo as TipoRecomendacion, dedupeKey: row.dedupe_key, titulo: row.titulo, motivo: row.motivo,
    datosUsados: row.datos_usados as Recomendacion['datosUsados'], riesgo: row.riesgo as Riesgo,
    impacto: row.impacto as Impacto | null, confianza: row.confianza as unknown as Confianza, score: row.score,
    prioridad: row.prioridad as Prioridad, nivelAutonomia: row.nivel_autonomia as Recomendacion['nivelAutonomia'],
    accion: row.accion as AccionDecision, socioId: row.socio_id, sesionId: row.sesion_id, reciboId: row.recibo_id,
    tiempoEstimadoMin: row.tiempo_estimado_min, estado: row.estado as EstadoRecomendacion,
    vistaEn: row.vista_en, expiraEn: row.expira_en, creadoEn: row.creado_en,
    resueltoEn: row.resuelto_en, resueltoPor: row.resuelto_por,
  };
}

function recomendacionToDb(r: Recomendacion) {
  return {
    id: r.id, studio_id: r.studioId, decision_session_id: r.decisionSessionId, algorithm_version: r.algorithmVersion,
    especialista: r.especialista, tipo: r.tipo, dedupe_key: r.dedupeKey, titulo: r.titulo, motivo: r.motivo,
    datos_usados: r.datosUsados, riesgo: r.riesgo, impacto: r.impacto, confianza: r.confianza, score: r.score,
    prioridad: r.prioridad, nivel_autonomia: r.nivelAutonomia, accion: r.accion, socio_id: r.socioId,
    sesion_id: r.sesionId, recibo_id: r.reciboId, tiempo_estimado_min: r.tiempoEstimadoMin, estado: r.estado,
    vista_en: r.vistaEn, expira_en: r.expiraEn, creado_en: r.creadoEn, resuelto_en: r.resueltoEn, resuelto_por: r.resueltoPor,
  };
}

/** Convierte una candidata puntuada (núcleo puro) en Recomendacion persistible. */
export function construirRecomendacion(c: CandidataPriorizada, ctx: {
  id: string; studioId: string; decisionSessionId: string; algorithmVersion: string;
  nivelAutonomia: Recomendacion['nivelAutonomia']; expiraEn: string; creadoEn: string;
}): Recomendacion {
  return {
    id: ctx.id, studioId: ctx.studioId, decisionSessionId: ctx.decisionSessionId, algorithmVersion: ctx.algorithmVersion,
    especialista: c.especialista, tipo: c.tipo, dedupeKey: c.dedupeKey, titulo: c.tituloMotor, motivo: c.motivoMotor,
    datosUsados: c.datosUsados, riesgo: c.riesgo, impacto: c.impacto ?? null, confianza: c.confianza, score: c.score,
    prioridad: c.prioridad, nivelAutonomia: ctx.nivelAutonomia, accion: c.accion, socioId: c.socioId ?? null,
    sesionId: c.sesionId ?? null, reciboId: c.reciboId ?? null, tiempoEstimadoMin: c.tiempoEstimadoMin,
    estado: 'PENDIENTE', vistaEn: null, expiraEn: ctx.expiraEn, creadoEn: ctx.creadoEn,
    resueltoEn: null, resueltoPor: null,
  };
}

/**
 * Upsert por dedupe viva (Arquitectura §6 F2): refresca la existente
 * PENDIENTE/APROBADA con el mismo dedupeKey, o inserta una nueva. El índice
 * único es PARCIAL — el cliente de Supabase no soporta `ON CONFLICT ... WHERE`,
 * así que se resuelve en dos pasos (select + update/insert) en vez de
 * `.upsert()`.
 */
export async function dbUpsertRecomendacion(r: Recomendacion): Promise<void> {
  const { data: existente, error: selectError } = await supabase
    .from('recomendaciones')
    .select('id')
    .eq('studio_id', r.studioId)
    .eq('dedupe_key', r.dedupeKey)
    .in('estado', ['PENDIENTE', 'APROBADA'])
    .maybeSingle();
  if (selectError) { reportError('[dbUpsertRecomendacion:select]', selectError); return; }

  const row = recomendacionToDb(r);
  if (existente) {
    // id/creado_en nunca se pisan al refrescar una PENDIENTE/APROBADA viva.
    const actualizable: Partial<typeof row> = { ...row };
    delete actualizable.id;
    delete actualizable.creado_en;
    const { error } = await supabase.from('recomendaciones').update(actualizable).eq('id', existente.id);
    if (error) reportError('[dbUpsertRecomendacion:update]', error);
  } else {
    const { error } = await supabase.from('recomendaciones').insert(row);
    if (error) reportError('[dbUpsertRecomendacion:insert]', error);
  }
}

/**
 * Transición condicional (Arquitectura §7): solo aplica si el estado actual
 * en DB coincide con `desde` — hace el "doble clic" seguro sin locks.
 */
export async function dbTransicionarRecomendacion(
  id: string,
  desde: EstadoRecomendacion,
  hacia: EstadoRecomendacion,
  extra: { resueltoPor?: string | null; resueltoEn?: string } = {}
): Promise<{ ok: boolean; motivo?: string }> {
  const patch: Record<string, unknown> = { estado: hacia };
  if (extra.resueltoPor !== undefined) patch.resuelto_por = extra.resueltoPor;
  if (extra.resueltoEn !== undefined) patch.resuelto_en = extra.resueltoEn;

  const { data, error } = await supabase
    .from('recomendaciones')
    .update(patch)
    .eq('id', id)
    .eq('estado', desde)
    .select('id')
    .maybeSingle();
  if (error) { reportError('[dbTransicionarRecomendacion]', error); return { ok: false, motivo: error.message }; }
  if (!data) return { ok: false, motivo: `La recomendación no estaba en estado ${desde}` };
  return { ok: true };
}

export async function dbMarcarVista(id: string, vistaEn: string): Promise<void> {
  // Solo se rellena la primera vez — no pisa una vistaEn ya existente.
  const { error } = await supabase.from('recomendaciones').update({ vista_en: vistaEn }).eq('id', id).is('vista_en', null);
  if (error) reportError('[dbMarcarVista]', error);
}

export async function dbListPendientes(studioId: string): Promise<Recomendacion[]> {
  // Sin ORDER BY prioridad en SQL: 'CRITICA'/'ALTA'/'MEDIA'/'BAJA' ordenado
  // alfabéticamente saldría ALTA, BAJA, CRITICA, MEDIA — el orden real
  // (severidad, luego score) lo aplica quien consuma la lista, con la misma
  // lógica ya testeada en prioridad.ts (seleccionarPrioridadesHome).
  const { data, error } = await supabase
    .from('recomendaciones')
    .select('*')
    .eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE')
    .order('score', { ascending: false });
  if (error) { reportError('[dbListPendientes]', error); return []; }
  return (data ?? []).map(r => mapRecomendacion(r as RowRecomendaciones));
}

export async function dbListResueltas90d(studioId: string, now: Date): Promise<Recomendacion[]> {
  const desde = new Date(now.getTime() - 90 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('recomendaciones')
    .select('*')
    .eq('studio_id', studioId)
    .in('estado', ['RECHAZADA', 'EXPIRADA', 'EJECUTADA'])
    .gte('resuelto_en', desde);
  if (error) { reportError('[dbListResueltas90d]', error); return []; }
  return (data ?? []).map(r => mapRecomendacion(r as RowRecomendaciones));
}

export async function dbGetRecomendacion(id: string): Promise<Recomendacion | null> {
  const { data, error } = await supabase.from('recomendaciones').select('*').eq('id', id).maybeSingle();
  if (error) { reportError('[dbGetRecomendacion]', error); return null; }
  return data ? mapRecomendacion(data as RowRecomendaciones) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// recomendacion_outcomes
// ═══════════════════════════════════════════════════════════════════════════

interface RowOutcomes {
  id: string; studio_id: string; recomendacion_id: string; evento: string; outcome: string;
  senal_observada: string | null; ventana_dias: number; medido_en: string | null;
}

function mapOutcome(row: RowOutcomes): Outcome {
  return {
    id: row.id, studioId: row.studio_id, recomendacionId: row.recomendacion_id,
    evento: row.evento as Outcome['evento'], outcome: row.outcome as Outcome['outcome'],
    senalObservada: row.senal_observada as Outcome['senalObservada'], ventanaDias: row.ventana_dias, medidoEn: row.medido_en,
  };
}

export async function dbInsertOutcome(o: Omit<Outcome, 'id'>): Promise<void> {
  const { error } = await supabase.from('recomendacion_outcomes').insert({
    id: uid(), studio_id: o.studioId, recomendacion_id: o.recomendacionId, evento: o.evento,
    outcome: o.outcome, senal_observada: o.senalObservada, ventana_dias: o.ventanaDias, medido_en: o.medidoEn,
  });
  if (error) reportError('[dbInsertOutcome]', error);
}

export async function dbActualizarOutcome(id: string, patch: { outcome: Outcome['outcome']; senalObservada: Outcome['senalObservada']; medidoEn: string }): Promise<void> {
  const { error } = await supabase.from('recomendacion_outcomes').update({
    outcome: patch.outcome, senal_observada: patch.senalObservada, medido_en: patch.medidoEn,
  }).eq('id', id);
  if (error) reportError('[dbActualizarOutcome]', error);
}

export async function dbGetOutcomePorRecomendacion(recomendacionId: string, evento: Outcome['evento']): Promise<Outcome | null> {
  const { data, error } = await supabase.from('recomendacion_outcomes').select('*').eq('recomendacion_id', recomendacionId).eq('evento', evento).maybeSingle();
  if (error) { reportError('[dbGetOutcomePorRecomendacion]', error); return null; }
  return data ? mapOutcome(data as RowOutcomes) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// memoria_socio
// ═══════════════════════════════════════════════════════════════════════════

interface RowMemoriaSocio {
  id: string; studio_id: string; socio_id: string; clave: string; valor: Record<string, unknown>;
  nivel: string; confianza: string; origen: string; creado_por: string | null; evidencia: string;
  activa: boolean; expira_en: string | null;
}

function mapHechoMemoria(row: RowMemoriaSocio): HechoMemoria {
  return {
    id: row.id, studioId: row.studio_id, socioId: row.socio_id, clave: row.clave as HechoMemoria['clave'],
    valor: row.valor as HechoMemoria['valor'], nivel: row.nivel as HechoMemoria['nivel'],
    confianza: row.confianza as HechoMemoria['confianza'], origen: row.origen as HechoMemoria['origen'],
    creadoPor: row.creado_por, evidencia: row.evidencia, activa: row.activa, expiraEn: row.expira_en,
  };
}

// Devuelve un array plano, no un Map — un Map no sobrevive la serialización a
// JSON que Inngest hace entre steps (JSON.stringify(new Map()) → "{}"), así
// que cruzar esa frontera con un Map pierde silenciosamente todos los datos
// en cuanto hay un replay. `construirMapaMemoria` reconstruye el Map FUERA
// del step, en memoria del propio handler.
export async function dbListMemoriaRows(studioId: string): Promise<HechoMemoria[]> {
  const { data, error } = await supabase.from('memoria_socio').select('*').eq('studio_id', studioId).eq('activa', true);
  if (error) { reportError('[dbListMemoriaRows]', error); return []; }
  return (data ?? []).map(row => mapHechoMemoria(row as RowMemoriaSocio));
}

export function construirMapaMemoria(hechos: HechoMemoria[]): MemoriaEstudio {
  const memoria: MemoriaEstudio = new Map();
  for (const hecho of hechos) {
    const arr = memoria.get(hecho.socioId) ?? [];
    arr.push(hecho);
    memoria.set(hecho.socioId, arr);
  }
  return memoria;
}

/** Upsert por (studio_id, socio_id, clave) — catálogo cerrado, un hecho activo por clave y socia. */
export async function dbUpsertHechoMemoria(h: NuevoHechoMemoria): Promise<void> {
  const { error } = await supabase.from('memoria_socio').upsert({
    id: uid(), studio_id: h.studioId, socio_id: h.socioId, clave: h.clave, valor: h.valor,
    nivel: h.nivel, confianza: h.confianza, origen: h.origen, creado_por: h.creadoPor,
    evidencia: h.evidencia, activa: h.activa, expira_en: h.expiraEn, actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,socio_id,clave' });
  if (error) reportError('[dbUpsertHechoMemoria]', error);
}

// ═══════════════════════════════════════════════════════════════════════════
// resumen_diario
// ═══════════════════════════════════════════════════════════════════════════

interface RowResumenDiario {
  id: string; studio_id: string; fecha: string; estado_general: string; saludo: string;
  mientras_dormias: ItemMientrasDormias[]; n_decisiones: number; tiempo_estimado_min: number;
  impacto_total: Record<string, unknown> | null; generado_en: string;
}

function mapResumenDiario(row: RowResumenDiario): ResumenDiario {
  return {
    studioId: row.studio_id, fecha: row.fecha, estadoGeneral: row.estado_general as ResumenDiario['estadoGeneral'],
    saludo: row.saludo, mientrasDormias: row.mientras_dormias, nDecisiones: row.n_decisiones,
    tiempoEstimadoMin: row.tiempo_estimado_min, impactoTotal: row.impacto_total as Impacto | null, generadoEn: row.generado_en,
  };
}

/** Upsert por (studio_id, fecha) — el análisis de las 14:30 sobreescribe el de las 06:30. */
export async function dbUpsertResumenDiario(r: ResumenDiario): Promise<string> {
  const id = uid();
  const { data, error } = await supabase.from('resumen_diario').upsert({
    id, studio_id: r.studioId, fecha: r.fecha, estado_general: r.estadoGeneral, saludo: r.saludo,
    mientras_dormias: r.mientrasDormias, n_decisiones: r.nDecisiones, tiempo_estimado_min: r.tiempoEstimadoMin,
    impacto_total: r.impactoTotal, generado_en: r.generadoEn,
  }, { onConflict: 'studio_id,fecha' }).select('id').single();
  if (error) { reportError('[dbUpsertResumenDiario]', error); return id; }
  return data.id;
}

export async function dbGetResumenDiario(studioId: string, fecha: string): Promise<ResumenDiario | null> {
  const { data, error } = await supabase.from('resumen_diario').select('*').eq('studio_id', studioId).eq('fecha', fecha).maybeSingle();
  if (error) { reportError('[dbGetResumenDiario]', error); return null; }
  return data ? mapResumenDiario(data as RowResumenDiario) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// decision_feature_flags
// ═══════════════════════════════════════════════════════════════════════════

interface RowFeatureFlags {
  id: string; studio_id: string; flag: string; activo: boolean; activado_en: string | null; activado_por: string | null;
}

function mapFeatureFlag(row: RowFeatureFlags): DecisionFeatureFlag {
  return { id: row.id, studioId: row.studio_id, flag: row.flag as DecisionFlag, activo: row.activo, activadoEn: row.activado_en, activadoPor: row.activado_por };
}

export async function dbGetFeatureFlags(studioId: string): Promise<Map<DecisionFlag, boolean>> {
  const { data, error } = await supabase.from('decision_feature_flags').select('*').eq('studio_id', studioId);
  if (error) { reportError('[dbGetFeatureFlags]', error); return new Map(); }
  const flags = new Map<DecisionFlag, boolean>();
  for (const row of (data ?? [])) {
    const f = mapFeatureFlag(row as RowFeatureFlags);
    flags.set(f.flag, f.activo);
  }
  return flags;
}

export async function dbSetFeatureFlag(studioId: string, flag: DecisionFlag, activo: boolean, activadoPor: string): Promise<void> {
  const { error } = await supabase.from('decision_feature_flags').upsert({
    id: uid(), studio_id: studioId, flag, activo, activado_en: new Date().toISOString(), activado_por: activadoPor,
  }, { onConflict: 'studio_id,flag' });
  if (error) reportError('[dbSetFeatureFlag]', error);
}
