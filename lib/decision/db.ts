// Adaptador de escritura/lectura (DECISION-OS-ARQUITECTURA.md §5,
// DECISION-OS-MODELO-DATOS.md §4). Mappers Row↔dominio + dbXxx de las 6
// tablas nuevas — server-only, NO engorda lib/supabase-data.ts. Mismo patrón
// de mappers (mapXxx/xxxToDb) y de errores (reportError) que ese archivo.
import * as Sentry from '@sentry/nextjs';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import type {
  AccionDecision, Confianza, DecisionFeatureFlag, DecisionFlag, DecisionSession, EspecialistaId,
  EstadoRecomendacion, HechoMemoria, Impacto, ItemMientrasDormias, MemoriaEstudio, MensajeDia, Outcome,
  Prioridad, Recomendacion, ResumenDiario, Riesgo, TipoRecomendacion,
} from './tipos.ts';
import type { NuevoHechoMemoria } from './memoria.ts';
import type { CandidataPriorizada } from './prioridad.ts';
import { type AutonomiaConfig, AUTONOMIA_CONFIG_DEFAULT, sanitizarConfig } from './autonomia.ts';

// Decision OS escribe con el cliente service-role (salta RLS). Con el cliente
// anon, RLS bloqueaba silenciosamente todos los INSERT/UPSERT de estas tablas
// y las lecturas volvían vacías → el Centro de Control quedaba en "modo
// aprendizaje" pese a haber datos. Se resuelve una vez por llamada (cacheado).
function db() {
  return requireSupabaseAdmin();
}

function reportError(tag: string, error: unknown) {
  console.error(tag, error);
  // A-6: los fallos de escritura del Decision OS también llegan a Sentry.
  try {
    Sentry.captureException(
      error instanceof Error ? error : new Error(`${tag}: ${typeof error === 'string' ? error : JSON.stringify(error)}`),
      { tags: { area: 'decision-os' }, extra: { op: tag } },
    );
  } catch { /* nunca romper la escritura por el reporte */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// decision_sessions
// ═══════════════════════════════════════════════════════════════════════════

export async function dbInsertDecisionSession(input: {
  studioId: string; disparadoPor: DecisionSession['disparadoPor']; algorithmVersion: string; iniciadoEn: string;
}): Promise<string> {
  const id = uid();
  const { error } = await db().from('decision_sessions').insert({
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
  const { error } = await db().from('decision_sessions').update({
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
  const { data: existente, error: selectError } = await db()
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
    const { error } = await db().from('recomendaciones').update(actualizable).eq('id', existente.id);
    if (error) reportError('[dbUpsertRecomendacion:update]', error);
  } else {
    const { error } = await db().from('recomendaciones').insert(row);
    if (error) reportError('[dbUpsertRecomendacion:insert]', error);
  }
}

/**
 * Transición condicional (Arquitectura §7): solo aplica si el estado actual
 * en DB coincide con `desde` — hace el "doble clic" seguro sin locks.
 */
// `studioId` es obligatorio a propósito: sin él, la única barrera contra
// aprobar/rechazar la recomendación de OTRO estudio vivía en el caller (la
// comprobación `recomendacion.studioId !== sesion.studioId` de las rutas
// aprobar/rechazar) — correcta hoy, pero frágil: un futuro caller que no la
// repitiera reabriría el mismo hueco que ya se cerró una vez en #195.
export async function dbTransicionarRecomendacion(
  id: string,
  studioId: string,
  desde: EstadoRecomendacion,
  hacia: EstadoRecomendacion,
  extra: { resueltoPor?: string | null; resueltoEn?: string } = {}
): Promise<{ ok: boolean; motivo?: string }> {
  const patch: Record<string, unknown> = { estado: hacia };
  if (extra.resueltoPor !== undefined) patch.resuelto_por = extra.resueltoPor;
  if (extra.resueltoEn !== undefined) patch.resuelto_en = extra.resueltoEn;

  const { data, error } = await db()
    .from('recomendaciones')
    .update(patch)
    .eq('id', id)
    .eq('studio_id', studioId)
    .eq('estado', desde)
    .select('id')
    .maybeSingle();
  if (error) { reportError('[dbTransicionarRecomendacion]', error); return { ok: false, motivo: error.message }; }
  if (!data) return { ok: false, motivo: `La recomendación no estaba en estado ${desde}` };
  return { ok: true };
}

/**
 * "Recuérdamelo": la recomendación se queda PENDIENTE (no es una transición
 * de estado, solo se aplaza su vencimiento) — el Umbral ya no la repetirá en
 * los próximos días por la puerta de novedad (queda en `decision_mensajes_dia`
 * de hoy), y con `expira_en` empujada no caduca sola mientras tanto.
 */
export async function dbPosponerRecomendacion(id: string, studioId: string, nuevaExpiraEn: string): Promise<{ ok: boolean }> {
  const { data, error } = await db()
    .from('recomendaciones')
    .update({ expira_en: nuevaExpiraEn })
    .eq('id', id).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
    .select('id').maybeSingle();
  if (error) { reportError('[dbPosponerRecomendacion]', error); return { ok: false }; }
  return { ok: !!data };
}

export async function dbMarcarVista(id: string, vistaEn: string): Promise<void> {
  // Solo se rellena la primera vez — no pisa una vistaEn ya existente.
  const { error } = await db().from('recomendaciones').update({ vista_en: vistaEn }).eq('id', id).is('vista_en', null);
  if (error) reportError('[dbMarcarVista]', error);
}

export async function dbListPendientes(studioId: string): Promise<Recomendacion[]> {
  // Sin ORDER BY prioridad en SQL: 'CRITICA'/'ALTA'/'MEDIA'/'BAJA' ordenado
  // alfabéticamente saldría ALTA, BAJA, CRITICA, MEDIA — el orden real
  // (severidad, luego score) lo aplica quien consuma la lista, con la misma
  // lógica ya testeada en prioridad.ts (seleccionarPrioridadesHome).
  const { data, error } = await db()
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
  const { data, error } = await db()
    .from('recomendaciones')
    .select('*')
    .eq('studio_id', studioId)
    .in('estado', ['RECHAZADA', 'EXPIRADA', 'EJECUTADA'])
    .gte('resuelto_en', desde);
  if (error) { reportError('[dbListResueltas90d]', error); return []; }
  return (data ?? []).map(r => mapRecomendacion(r as RowRecomendaciones));
}

export async function dbGetRecomendacion(id: string): Promise<Recomendacion | null> {
  const { data, error } = await db().from('recomendaciones').select('*').eq('id', id).maybeSingle();
  if (error) { reportError('[dbGetRecomendacion]', error); return null; }
  return data ? mapRecomendacion(data as RowRecomendaciones) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// recomendacion_outcomes
// ═══════════════════════════════════════════════════════════════════════════

interface RowOutcomes {
  id: string; studio_id: string; recomendacion_id: string; evento: string; outcome: string;
  senal_observada: string | null; ventana_dias: number; medido_en: string | null;
  impacto_real: Impacto | null; confianza_medicion: string | null;
}

function mapOutcome(row: RowOutcomes): Outcome {
  return {
    id: row.id, studioId: row.studio_id, recomendacionId: row.recomendacion_id,
    evento: row.evento as Outcome['evento'], outcome: row.outcome as Outcome['outcome'],
    senalObservada: row.senal_observada as Outcome['senalObservada'], ventanaDias: row.ventana_dias, medidoEn: row.medido_en,
    impactoReal: row.impacto_real, confianzaMedicion: row.confianza_medicion as Outcome['confianzaMedicion'],
  };
}

// Registro de actividad para el flujo del Centro de Control: al aprobar/rechazar
// una recomendación el propietario no veía NADA (ni una línea) — ahora queda
// traza en el feed "Actividad" ("todo tenga conexión"). Enlace al Centro.
export async function dbLogActividadReciente(a: { studioId: string; tipo: string; texto: string; socioId?: string | null }): Promise<void> {
  const { error } = await db().from('actividad_reciente').insert({
    id: uid(), studio_id: a.studioId, tipo: a.tipo, texto: a.texto,
    socio_id: a.socioId ?? null, enlace: '/centro-de-control', creado_en: new Date().toISOString(), actor_nombre: null,
  });
  if (error) reportError('[dbLogActividadReciente]', error);
}

export async function dbInsertOutcome(o: Omit<Outcome, 'id'>): Promise<void> {
  const { error } = await db().from('recomendacion_outcomes').insert({
    id: uid(), studio_id: o.studioId, recomendacion_id: o.recomendacionId, evento: o.evento,
    outcome: o.outcome, senal_observada: o.senalObservada, ventana_dias: o.ventanaDias, medido_en: o.medidoEn,
    impacto_real: o.impactoReal, confianza_medicion: o.confianzaMedicion,
  });
  if (error) reportError('[dbInsertOutcome]', error);
}

export async function dbActualizarOutcome(id: string, patch: {
  outcome: Outcome['outcome']; senalObservada: Outcome['senalObservada']; medidoEn: string;
  impactoReal: Outcome['impactoReal']; confianzaMedicion: Outcome['confianzaMedicion'];
}): Promise<void> {
  const { error } = await db().from('recomendacion_outcomes').update({
    outcome: patch.outcome, senal_observada: patch.senalObservada, medido_en: patch.medidoEn,
    impacto_real: patch.impactoReal, confianza_medicion: patch.confianzaMedicion,
  }).eq('id', id);
  if (error) reportError('[dbActualizarOutcome]', error);
}

// Outcome con el contexto de la recomendación que lo generó — el círculo de
// aprendizaje (`components/decision/seguimiento.tsx`) necesita el título/tipo/
// socia para redactar "Llamaste a Marta. Sigue siendo clienta.", no solo el
// resultado crudo.
export interface OutcomeConRecomendacion extends Outcome {
  recomendacionTitulo: string;
  recomendacionTipo: TipoRecomendacion;
  socioId: string | null;
}

interface RowOutcomeConRecomendacion extends RowOutcomes {
  recomendaciones: { titulo: string; tipo: string; socio_id: string | null } | null;
}

// Últimos outcomes ya medidos (POSITIVO/NEGATIVO/NEUTRO, nunca PENDIENTE) —
// alimenta el círculo de aprendizaje. Incluye NEGATIVO a propósito: el
// Umbral admite cuando no acertó, no solo presume cuando sí.
export async function dbListOutcomesRecientes(studioId: string, limite = 3): Promise<OutcomeConRecomendacion[]> {
  const { data, error } = await db()
    .from('recomendacion_outcomes')
    .select('*, recomendaciones!inner(titulo, tipo, socio_id)')
    .eq('studio_id', studioId)
    .neq('outcome', 'PENDIENTE')
    .order('medido_en', { ascending: false, nullsFirst: false })
    .limit(limite);
  if (error) { reportError('[dbListOutcomesRecientes]', error); return []; }
  return (data ?? []).map((row: unknown) => {
    const r = row as RowOutcomeConRecomendacion;
    return {
      ...mapOutcome(r),
      recomendacionTitulo: r.recomendaciones?.titulo ?? '',
      recomendacionTipo: (r.recomendaciones?.tipo ?? 'RECUPERAR_SOCIA') as TipoRecomendacion,
      socioId: r.recomendaciones?.socio_id ?? null,
    };
  });
}

export async function dbGetOutcomePorRecomendacion(recomendacionId: string, evento: Outcome['evento']): Promise<Outcome | null> {
  // A-17: `.limit(1)` en vez de `.maybeSingle()` a secas. Si por un duplicado
  // preexistente (antes del guard del ejecutor) hubiera >1 fila para la misma
  // (recomendacion, evento), maybeSingle lanzaba error y la medición quedaba rota
  // para siempre. Se ordena por `medido_en` NULLS FIRST para elegir la fila aún
  // sin medir (la que la medición debe actualizar).
  const { data, error } = await db()
    .from('recomendacion_outcomes')
    .select('*')
    .eq('recomendacion_id', recomendacionId)
    .eq('evento', evento)
    .order('medido_en', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
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
  const { data, error } = await db().from('memoria_socio').select('*').eq('studio_id', studioId).eq('activa', true);
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
  const { error } = await db().from('memoria_socio').upsert({
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
  const { data, error } = await db().from('resumen_diario').upsert({
    id, studio_id: r.studioId, fecha: r.fecha, estado_general: r.estadoGeneral, saludo: r.saludo,
    mientras_dormias: r.mientrasDormias, n_decisiones: r.nDecisiones, tiempo_estimado_min: r.tiempoEstimadoMin,
    impacto_total: r.impactoTotal, generado_en: r.generadoEn,
  }, { onConflict: 'studio_id,fecha' }).select('id').single();
  if (error) { reportError('[dbUpsertResumenDiario]', error); return id; }
  return data.id;
}

export async function dbGetResumenDiario(studioId: string, fecha: string): Promise<ResumenDiario | null> {
  const { data, error } = await db().from('resumen_diario').select('*').eq('studio_id', studioId).eq('fecha', fecha).maybeSingle();
  if (error) { reportError('[dbGetResumenDiario]', error); return null; }
  return data ? mapResumenDiario(data as RowResumenDiario) : null;
}

// El Centro de Control mostraba el resumen SOLO si existía uno con la fecha de
// HOY: entre ejecuciones del cron (2×/día) o si el análisis de hoy aún no había
// corrido, el panel caía a "Aún estoy conociendo tu estudio" aunque hubiera un
// briefing reciente perfectamente válido. Se toma el más reciente dentro de una
// ventana (por defecto 7 días); solo si no hay ninguno se considera "sin datos".
export async function dbGetResumenDiarioReciente(studioId: string, now: Date, maxDias = 7): Promise<ResumenDiario | null> {
  const desde = new Date(now.getTime() - maxDias * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db()
    .from('resumen_diario')
    .select('*')
    .eq('studio_id', studioId)
    .gte('fecha', desde)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { reportError('[dbGetResumenDiarioReciente]', error); return null; }
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
  const { data, error } = await db().from('decision_feature_flags').select('*').eq('studio_id', studioId);
  if (error) { reportError('[dbGetFeatureFlags]', error); return new Map(); }
  const flags = new Map<DecisionFlag, boolean>();
  for (const row of (data ?? [])) {
    const f = mapFeatureFlag(row as RowFeatureFlags);
    flags.set(f.flag, f.activo);
  }
  return flags;
}

// P2-5: filas crudas, NO un Map — para usar dentro de un `step.run` de
// Inngest. Un Map devuelto directo desde un step se serializa a JSON al
// memoizarse y vuelve como `{}` en el replay (mismo motivo por el que
// dbListMemoriaRows existe aparte de construirMapaMemoria, ver ese comentario
// en lib/inngest/decision.ts). Reconstruir el Map SIEMPRE fuera del step.
export async function dbListFeatureFlagRows(studioId: string): Promise<{ flag: DecisionFlag; activo: boolean }[]> {
  const { data, error } = await db().from('decision_feature_flags').select('flag, activo').eq('studio_id', studioId);
  if (error) { reportError('[dbListFeatureFlagRows]', error); return []; }
  return (data ?? []).map(r => ({ flag: r.flag as DecisionFlag, activo: r.activo as boolean }));
}

export async function dbSetFeatureFlag(studioId: string, flag: DecisionFlag, activo: boolean, activadoPor: string): Promise<void> {
  const { error } = await db().from('decision_feature_flags').upsert({
    id: uid(), studio_id: studioId, flag, activo, activado_en: new Date().toISOString(), activado_por: activadoPor,
  }, { onConflict: 'studio_id,flag' });
  if (error) reportError('[dbSetFeatureFlag]', error);
}

// ═══════════════════════════════════════════════════════════════════════════
// decision_mensajes_dia — el Umbral (lib/decision/umbral.ts)
// ═══════════════════════════════════════════════════════════════════════════

interface RowMensajeDia {
  id: string; studio_id: string; fecha: string; tipo: string; recomendacion_id: string | null;
  dedupe_key: string | null; motivo_motor: string | null; motivo_silencio: string | null;
  enviado_en: string | null; creado_en: string;
}

function mapMensajeDia(row: RowMensajeDia): MensajeDia {
  return {
    id: row.id, studioId: row.studio_id, fecha: row.fecha, tipo: row.tipo as MensajeDia['tipo'],
    recomendacionId: row.recomendacion_id, dedupeKey: row.dedupe_key, motivoMotor: row.motivo_motor,
    motivoSilencio: row.motivo_silencio, enviadoEn: row.enviado_en, creadoEn: row.creado_en,
  };
}

// Upsert por (studio_id, fecha) — el análisis de las 14:30 sobreescribe el de
// las 06:30, mismo criterio que `dbUpsertResumenDiario`. Este es el punto que
// hace cumplir "nunca dos mensajes el mismo día" también a nivel de fila viva.
export async function dbUpsertMensajeDia(m: Omit<MensajeDia, 'id' | 'creadoEn'>): Promise<void> {
  const { error } = await db().from('decision_mensajes_dia').upsert({
    id: uid(), studio_id: m.studioId, fecha: m.fecha, tipo: m.tipo, recomendacion_id: m.recomendacionId,
    dedupe_key: m.dedupeKey, motivo_motor: m.motivoMotor, motivo_silencio: m.motivoSilencio, enviado_en: m.enviadoEn,
  }, { onConflict: 'studio_id,fecha' });
  if (error) reportError('[dbUpsertMensajeDia]', error);
}

export async function dbGetMensajeDia(studioId: string, fecha: string): Promise<MensajeDia | null> {
  const { data, error } = await db().from('decision_mensajes_dia').select('*').eq('studio_id', studioId).eq('fecha', fecha).maybeSingle();
  if (error) { reportError('[dbGetMensajeDia]', error); return null; }
  return data ? mapMensajeDia(data as RowMensajeDia) : null;
}

// Ventana reciente para la puerta 3 del Umbral (novedad) y para detectar
// "semana tranquila" en la UI (7 SILENCIO seguidos).
export async function dbListMensajesRecientes(studioId: string, now: Date, dias = 7): Promise<MensajeDia[]> {
  const desde = new Date(now.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db()
    .from('decision_mensajes_dia')
    .select('*')
    .eq('studio_id', studioId)
    .gte('fecha', desde)
    .order('fecha', { ascending: false });
  if (error) { reportError('[dbListMensajesRecientes]', error); return []; }
  return (data ?? []).map(row => mapMensajeDia(row as RowMensajeDia));
}

// Una semana es "silenciosa" si el Umbral no encontró NADA que mereciera
// interrumpir a la propietaria en los 7 días [lunes, domingo] (ambos
// inclusive, YYYY-MM-DD) — cero filas `tipo='MENSAJE'`. Rango FIJO de
// calendario, a diferencia de `dbListMensajesRecientes` (ventana rodante
// "últimos N días" pensada para la UI) — el resumen semanal necesita saber
// de la semana que acaba de cerrar, no de "los últimos 7 días" desde hoy.
// `false` en error: no confirmar "silenciosa" ante un fallo de la propia
// consulta evita mandar un email de "semana tranquila" falso.
export async function dbSemanaFueSilenciosa(studioId: string, lunes: string, domingo: string): Promise<boolean> {
  const { count, error } = await db()
    .from('decision_mensajes_dia')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('tipo', 'MENSAJE')
    .gte('fecha', lunes)
    .lte('fecha', domingo);
  if (error) { reportError('[dbSemanaFueSilenciosa]', error); return false; }
  return (count ?? 0) === 0;
}

// Suma de ingresos cobrados en [desde, hasta] (YYYY-MM-DD, ambos inclusive)
// para UN estudio. Base de la "prueba comparativa" del resumen semanal
// (lib/inngest/resumen-semanal.ts): comparar la semana silenciosa contra la
// anterior. No reutiliza la RPC informe_ingresos (0096) porque esa RPC es
// SECURITY INVOKER y depende de la RLS de `recibos` (studio_id =
// current_studio_id(), atada a auth.uid()) — este cron corre server-side con
// el admin client, sin sesión, así que esa RPC devolvería 0 filas aquí.
// Consulta directa filtrada a mano por studio_id, mismo patrón que
// dbSemanaFueSilenciosa. El aviso de 0096 sobre el cap de 1000 filas del
// fetch de PostgREST es sobre el HISTÓRICO completo del estudio; una sola
// semana de recibos está muy lejos de esa escala. `0` en error: ante un
// fallo de la propia consulta, no se inventa un % de crecimiento.
export async function dbIngresosEnRango(studioId: string, desde: string, hasta: string): Promise<number> {
  const { data, error } = await db()
    .from('recibos')
    .select('importe')
    .eq('studio_id', studioId)
    .eq('estado', 'COBRADO')
    .gte('fecha_cobro', desde)
    .lte('fecha_cobro', hasta);
  if (error) { reportError('[dbIngresosEnRango]', error); return 0; }
  return (data ?? []).reduce((sum, r) => sum + Number(r.importe ?? 0), 0);
}

// Tasa de seguimiento por tipo — base del Umbral adaptativo (Fase 2, ver
// tentare-os.md "El Umbral no es fijo"). Dos consultas en vez de un join
// (supabase-js no hace joins arbitrarios sin una FK embed declarada, y aquí
// cruzamos dos tablas por id crudo): primero qué recomendaciones fueron
// alguna vez el mensaje del día, después su estado final. `total` solo cuenta
// las YA DECIDIDAS (APROBADA/EJECUTADA/RECHAZADA/FALLIDA) — una pospuesta o
// aún PENDIENTE no cuenta ni a favor ni en contra todavía.
export async function dbCalcularSeguimientoPorTipo(
  studioId: string, now: Date, dias = 90,
): Promise<Array<{ tipo: TipoRecomendacion; total: number; seguidas: number }>> {
  const desde = new Date(now.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const { data: mensajes, error: errMsg } = await db()
    .from('decision_mensajes_dia')
    .select('recomendacion_id')
    .eq('studio_id', studioId)
    .eq('tipo', 'MENSAJE')
    .gte('fecha', desde)
    .not('recomendacion_id', 'is', null);
  if (errMsg) { reportError('[dbCalcularSeguimientoPorTipo:mensajes]', errMsg); return []; }

  const ids = [...new Set((mensajes ?? []).map(m => m.recomendacion_id as string))];
  if (ids.length === 0) return [];

  const { data: recos, error: errRecos } = await db()
    .from('recomendaciones')
    .select('tipo, estado')
    .in('id', ids);
  if (errRecos) { reportError('[dbCalcularSeguimientoPorTipo:recomendaciones]', errRecos); return []; }

  const DECIDIDAS = new Set(['APROBADA', 'EJECUTADA', 'RECHAZADA', 'FALLIDA']);
  const SEGUIDAS = new Set(['APROBADA', 'EJECUTADA']);
  const porTipo = new Map<string, { total: number; seguidas: number }>();
  for (const r of recos ?? []) {
    if (!DECIDIDAS.has(r.estado)) continue;
    const acc = porTipo.get(r.tipo) ?? { total: 0, seguidas: 0 };
    acc.total += 1;
    if (SEGUIDAS.has(r.estado)) acc.seguidas += 1;
    porTipo.set(r.tipo, acc);
  }
  return [...porTipo.entries()].map(([tipo, v]) => ({ tipo: tipo as TipoRecomendacion, ...v }));
}

// Impacto REAL por tipo — base del ajuste de la puerta 5 del Umbral con
// evidencia de resultado, no solo de comportamiento (Pilar 3 de "Tentare
// 2030", migr 20260806213813, ver lib/decision/umbral.ts calibrarUmbral). Solo
// entran outcomes `confianza_medicion = 'MEDIDO'` — los NO_MEDIBLE no tienen
// una cifra real que promediar. `recomendaciones!inner(...)` es un join válido
// aquí (a diferencia de dbCalcularSeguimientoPorTipo) porque
// recomendacion_outcomes.recomendacion_id SÍ tiene una FK declarada a
// recomendaciones — mismo patrón que dbListOutcomesRecientes.
export async function dbCalcularImpactoRealPorTipo(
  studioId: string, now: Date, dias = 90,
): Promise<Array<{ tipo: TipoRecomendacion; nMedido: number; promedioReal: number; promedioEstimadoOriginal: number }>> {
  const desde = new Date(now.getTime() - dias * 86400000).toISOString();
  const { data, error } = await db()
    .from('recomendacion_outcomes')
    .select('impacto_real, recomendaciones!inner(tipo, impacto)')
    .eq('studio_id', studioId)
    .eq('confianza_medicion', 'MEDIDO')
    .gte('medido_en', desde);
  if (error) { reportError('[dbCalcularImpactoRealPorTipo]', error); return []; }

  const porTipo = new Map<string, { sumaReal: number; sumaEstimado: number; n: number }>();
  for (const row of data ?? []) {
    const r = row as unknown as {
      impacto_real: Impacto | null;
      recomendaciones: { tipo: string; impacto: Impacto | null } | null;
    };
    const tipo = r.recomendaciones?.tipo;
    const real = r.impacto_real?.valor;
    // El estimado original solo sirve de referencia si comparte unidad con el
    // real (EUR vs EUR_MES no son comparables sin normalizar, y normalizar
    // aquí sería inventar una tasa de conversión que ningún caso real pide:
    // dentro de un mismo `tipo`, ambos siempre nacen con la misma unidad).
    const estimado = r.impacto_real?.unidad === r.recomendaciones?.impacto?.unidad
      ? r.recomendaciones?.impacto?.valor : undefined;
    if (!tipo || typeof real !== 'number' || typeof estimado !== 'number' || estimado <= 0) continue;
    const acc = porTipo.get(tipo) ?? { sumaReal: 0, sumaEstimado: 0, n: 0 };
    acc.sumaReal += real; acc.sumaEstimado += estimado; acc.n += 1;
    porTipo.set(tipo, acc);
  }
  return [...porTipo.entries()].map(([tipo, v]) => ({
    tipo: tipo as TipoRecomendacion, nMedido: v.n,
    promedioReal: v.sumaReal / v.n, promedioEstimadoOriginal: v.sumaEstimado / v.n,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// decision_autonomia_config (0047) — piloto automático
// ═══════════════════════════════════════════════════════════════════════════

interface RowAutonomiaConfig {
  studio_id: string; activa: boolean; tipos_permitidos: string[]; max_diario: number;
  actualizado_en: string | null; actualizado_por: string | null;
}

// Config del piloto automático del estudio; saneada (nunca devuelve tipos fuera
// de la allowlist). Si no hay fila → apagado por defecto.
export async function dbGetAutonomiaConfig(studioId: string): Promise<AutonomiaConfig> {
  const { data, error } = await db().from('decision_autonomia_config').select('*').eq('studio_id', studioId).maybeSingle();
  if (error) { reportError('[dbGetAutonomiaConfig]', error); return AUTONOMIA_CONFIG_DEFAULT; }
  if (!data) return AUTONOMIA_CONFIG_DEFAULT;
  const row = data as RowAutonomiaConfig;
  return sanitizarConfig({
    activa: row.activa,
    tiposPermitidos: row.tipos_permitidos as AutonomiaConfig['tiposPermitidos'],
    maxDiario: row.max_diario,
  });
}

export async function dbSetAutonomiaConfig(studioId: string, config: AutonomiaConfig, actualizadoPor: string): Promise<AutonomiaConfig> {
  const c = sanitizarConfig(config);
  const { error } = await db().from('decision_autonomia_config').upsert({
    studio_id: studioId, activa: c.activa, tipos_permitidos: c.tiposPermitidos, max_diario: c.maxDiario,
    actualizado_en: new Date().toISOString(), actualizado_por: actualizadoPor,
  }, { onConflict: 'studio_id' });
  if (error) reportError('[dbSetAutonomiaConfig]', error);
  return c;
}

// Cuántas recomendaciones se han auto-ejecutado hoy (para respetar el tope diario).
// Día en UTC — el cron corre a 06:30/14:30 UTC; el cupo es una salvaguarda de
// volumen, no un límite fiscal, así que la frontera de día exacta no es crítica.
export async function dbCountAutonomasHoy(studioId: string, now: Date): Promise<number> {
  const inicioDia = new Date(now); inicioDia.setUTCHours(0, 0, 0, 0);
  const { count, error } = await db()
    .from('recomendaciones')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('resuelto_por', 'AUTONOMIA')
    .gte('resuelto_en', inicioDia.toISOString());
  if (error) { reportError('[dbCountAutonomasHoy]', error); return 0; }
  return count ?? 0;
}
