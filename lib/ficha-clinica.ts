// Ficha Clínica Operativa — lógica pura (FICHA-CLINICA.md §2, §4, §5, §7).
//
// TODO lo que decide el sistema clínico es determinista y testeable: semáforo,
// riesgo y alertas se CALCULAN aquí, sin I/O. La IA (§9) no participa — solo
// pone palabras a lo que estas funciones ya han calculado.
//
// No es una historia clínica médica: no diagnostica ni prescribe. El semáforo y
// el riesgo son ayudas de atención para la instructora, no dictámenes.

import type {
  CondicionSalud, RespuestaSesion, RespuestaSesionRow,
  NivelSemaforo, NivelRiesgo, ZonaCorporal, SeveridadCondicion, CategoriaCondicion,
} from './types';

// ─── Catálogo de restricciones por zona (§2) ─────────────────────────────────
// Códigos cerrados en vez de texto libre: es lo que permite generar alertas
// automáticas. Un código que empieza por `NO_` es una restricción "dura"
// (no realizar → semáforo ROJO); `EVITAR_` es blanda (adaptar → ÁMBAR).

export interface RestriccionDef { codigo: string; etiqueta: string }

export const RESTRICCIONES: Record<ZonaCorporal, RestriccionDef[]> = {
  RODILLA: [
    { codigo: 'NO_SALTOS', etiqueta: 'No saltos' },
    { codigo: 'NO_FLEXION_PROFUNDA', etiqueta: 'No flexión profunda' },
    { codigo: 'NO_ARRODILLARSE', etiqueta: 'No arrodillarse' },
  ],
  COLUMNA: [
    { codigo: 'EVITAR_FLEXION', etiqueta: 'Evitar flexión' },
    { codigo: 'EVITAR_EXTENSION', etiqueta: 'Evitar extensión' },
    { codigo: 'EVITAR_ROTACION', etiqueta: 'Evitar rotación' },
    { codigo: 'NO_CARGA_AXIAL', etiqueta: 'No carga axial' },
  ],
  HOMBRO: [
    { codigo: 'NO_ELEVACION_90', etiqueta: 'No elevación por encima de 90°' },
    { codigo: 'EVITAR_CARGA', etiqueta: 'Evitar carga' },
  ],
  CADERA: [
    { codigo: 'EVITAR_FLEXION_PROFUNDA', etiqueta: 'Evitar flexión profunda' },
    { codigo: 'EVITAR_ABDUCCION', etiqueta: 'Evitar abducción' },
  ],
  CUELLO: [
    { codigo: 'EVITAR_ROTACION', etiqueta: 'Evitar rotación' },
    { codigo: 'EVITAR_EXTENSION', etiqueta: 'Evitar extensión' },
  ],
  MUNECA: [
    { codigo: 'NO_CARGA', etiqueta: 'No carga en muñeca' },
    { codigo: 'EVITAR_APOYO', etiqueta: 'Evitar apoyo palmar' },
  ],
  TOBILLO: [
    { codigo: 'NO_SALTOS', etiqueta: 'No saltos' },
    { codigo: 'EVITAR_CARGA', etiqueta: 'Evitar carga' },
  ],
  GENERAL: [
    { codigo: 'EVITAR_ALTA_INTENSIDAD', etiqueta: 'Evitar alta intensidad' },
    { codigo: 'EVITAR_INVERSIONES', etiqueta: 'Evitar inversiones' },
    { codigo: 'EVITAR_DECUBITO_PRONO', etiqueta: 'Evitar decúbito prono' },
    { codigo: 'EVITAR_ABDOMINALES', etiqueta: 'Evitar abdominales clásicos' },
  ],
};

const ETIQUETA_POR_CODIGO: Map<string, string> = new Map();
for (const zona of Object.keys(RESTRICCIONES) as ZonaCorporal[]) {
  for (const r of RESTRICCIONES[zona]) ETIQUETA_POR_CODIGO.set(r.codigo, r.etiqueta);
}

/** Texto legible de un código de restricción; el propio código si es desconocido. */
export function etiquetaRestriccion(codigo: string): string {
  return ETIQUETA_POR_CODIGO.get(codigo) ?? codigo;
}

/** Una restricción es "dura" (impide, no solo adapta) si su código empieza por NO_. */
export function esRestriccionDura(codigo: string): boolean {
  return codigo.startsWith('NO_');
}

/** Códigos válidos para una zona — para validar/filtrar en la UI y el servidor. */
export function restriccionesDeZona(zona: ZonaCorporal): RestriccionDef[] {
  return RESTRICCIONES[zona] ?? [];
}

// ─── Metadatos de presentación compartidos ───────────────────────────────────

export const SEMAFORO_META: Record<NivelSemaforo, { emoji: string; label: string; color: string }> = {
  VERDE: { emoji: '🟢', label: 'Sin restricciones', color: '#059669' },
  AMBAR: { emoji: '🟡', label: 'Adaptar ejercicios', color: '#D97706' },
  ROJO:  { emoji: '🔴', label: 'Evitar movimientos', color: '#DC2626' },
};

export const RIESGO_META: Record<NivelRiesgo, { label: string; color: string }> = {
  BAJO:  { label: 'Riesgo bajo', color: '#059669' },
  MEDIO: { label: 'Riesgo medio', color: '#D97706' },
  ALTO:  { label: 'Riesgo alto', color: '#DC2626' },
};

// Evolución post-clase (§8): respuesta de 1 clic. Orden de mejor a peor.
export const RESPUESTAS_ORDEN: RespuestaSesion[] = ['MEJOR', 'IGUAL', 'MOLESTIAS', 'DOLOR'];
export const RESPUESTA_META: Record<RespuestaSesion, { emoji: string; label: string; color: string; bg: string }> = {
  MEJOR:     { emoji: '😀', label: 'Mejor',     color: '#059669', bg: '#D1FAE5' },
  IGUAL:     { emoji: '😐', label: 'Igual',     color: '#6B7280', bg: '#F3F4F6' },
  MOLESTIAS: { emoji: '😕', label: 'Molestias', color: '#92400E', bg: '#FEF3C7' },
  DOLOR:     { emoji: '😣', label: 'Dolor',     color: '#B91C1C', bg: '#FEE2E2' },
};

// ─── Helpers de fecha (deterministas, sin TZ ambigua) ────────────────────────

const MS_DIA = 86_400_000;
function utcDeDate(d: Date): number { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function utcDeISO(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
/** Días transcurridos desde `iso` hasta `hoy` (negativo si `iso` es futuro). */
export function diasDesde(iso: string, hoy: Date): number {
  return Math.floor((utcDeDate(hoy) - utcDeISO(iso)) / MS_DIA);
}

// ─── Núcleo derivado ─────────────────────────────────────────────────────────

const PESO_SEVERIDAD: Record<SeveridadCondicion, number> = { LEVE: 1, MEDIA: 2, ALTA: 3 };

export function condicionesActivas(condiciones: CondicionSalud[]): CondicionSalud[] {
  return condiciones.filter(c => c.estado === 'ACTIVA');
}

function tieneRestriccionDura(c: CondicionSalud): boolean {
  return c.restricciones.some(esRestriccionDura);
}

/**
 * Semáforo de salud (§4). Se deriva, no se guarda.
 *  VERDE  — sin condiciones activas.
 *  ÁMBAR  — condiciones activas que solo requieren adaptar.
 *  ROJO   — severidad ALTA o alguna restricción dura (NO_*): no realizar.
 */
export function semaforo(condiciones: CondicionSalud[]): NivelSemaforo {
  const activas = condicionesActivas(condiciones);
  if (activas.length === 0) return 'VERDE';
  if (activas.some(c => c.severidad === 'ALTA' || tieneRestriccionDura(c))) return 'ROJO';
  return 'AMBAR';
}

/** ¿La revisión de una condición activa está vencida a día de hoy? */
export function revisionVencida(c: CondicionSalud, hoy: Date): boolean {
  return c.estado === 'ACTIVA' && c.revisarEn != null && diasDesde(c.revisarEn, hoy) > 0;
}

export interface DesgloseRiesgo { severidad: number; restriccionesDuras: number; respuestas: number; revisiones: number }

/**
 * Nivel de riesgo (§5): cuánta atención prestar, NO un diagnóstico. Suma
 * acotada de señales objetivas → 0-10 → BAJO/MEDIO/ALTO. Explicable: devuelve
 * el desglose para poder justificar la barra.
 */
export function nivelRiesgo(
  condiciones: CondicionSalud[],
  respuestasRecientes: (RespuestaSesion | RespuestaSesionRow)[],
  hoy: Date,
): { nivel: NivelRiesgo; score: number; desglose: DesgloseRiesgo } {
  const activas = condicionesActivas(condiciones);

  const severidad = Math.min(6, activas.reduce((s, c) => s + PESO_SEVERIDAD[c.severidad], 0));
  const restriccionesDuras = Math.min(3, activas.reduce((s, c) => s + c.restricciones.filter(esRestriccionDura).length, 0));
  const revisiones = Math.min(2, activas.filter(c => revisionVencida(c, hoy)).length);

  const respuestas = Math.min(4, respuestasRecientes.reduce((s, r) => {
    const val = typeof r === 'string' ? r : r.respuesta;
    return s + (val === 'DOLOR' ? 2 : val === 'MOLESTIAS' ? 1 : 0);
  }, 0));

  const score = Math.min(10, severidad + restriccionesDuras + respuestas + revisiones);
  const nivel: NivelRiesgo = score >= 7 ? 'ALTO' : score >= 4 ? 'MEDIO' : 'BAJO';
  return { nivel, score, desglose: { severidad, restriccionesDuras, respuestas, revisiones } };
}

// ─── Alertas antes de la clase (§7) ──────────────────────────────────────────

/** Restricciones legibles de una condición, deduplicadas y en orden estable. */
export function restriccionesLegibles(c: CondicionSalud): string[] {
  return c.restricciones.map(etiquetaRestriccion);
}

/**
 * Aviso de una sola línea para el roster de la clase (§4 spec): la condición
 * activa de mayor severidad, sus restricciones y la revisión si está próxima o
 * vencida. Devuelve null si no hay nada que avisar (semáforo verde).
 */
export function alertaPreClase(
  nombre: string,
  condiciones: CondicionSalud[],
  hoy: Date,
): string | null {
  const activas = condicionesActivas(condiciones);
  if (activas.length === 0) return null;

  const principal = [...activas].sort((a, b) => PESO_SEVERIDAD[b.severidad] - PESO_SEVERIDAD[a.severidad])[0];
  const partes: string[] = [`${nombre} — ${principal.etiqueta}.`];

  const restr = restriccionesLegibles(principal);
  if (restr.length) partes.push(`${restr.join(', ')}.`);

  if (principal.revisarEn) {
    const dias = diasDesde(principal.revisarEn, hoy);
    if (dias > 0) partes.push(`Revisión vencida hace ${dias} d.`);
    else if (dias >= -7) partes.push(`Revisar en ${-dias} d.`);
  }
  return partes.join(' ');
}

// ─── Resumen agregado para la IA de prep de clase (§9) ────────────────────────
// La IA recibe ESTE agregado ya calculado, nunca datos crudos ni nombres. Es una
// función pura y testeable: la IA solo pone palabras a lo que aquí se cuenta.

export interface ResumenClaseSalud {
  totalAlumnas: number;
  conCondiciones: number;
  semaforos: { ambar: number; rojo: number };
  categorias: Partial<Record<CategoriaCondicion, number>>;   // nº de alumnas con ≥1 condición activa de esa categoría
  zonas: Partial<Record<ZonaCorporal, number>>;              // nº de condiciones activas por zona
  restricciones: { codigo: string; etiqueta: string; n: number }[]; // más frecuentes primero
  etiquetas: string[];                                       // descripciones de condiciones (SIN nombres), deduplicadas
}

/**
 * Agrega la salud del roster de una clase en cifras anónimas. Entrada: las
 * condiciones de cada alumna (una lista por alumna). No recibe ni emite nombres.
 */
export function resumenSaludClase(condicionesPorAlumna: CondicionSalud[][]): ResumenClaseSalud {
  const categorias: Partial<Record<CategoriaCondicion, number>> = {};
  const zonas: Partial<Record<ZonaCorporal, number>> = {};
  const restrCount = new Map<string, number>();
  const etiquetas = new Set<string>();
  let conCondiciones = 0;
  const semaforos = { ambar: 0, rojo: 0 };

  for (const condiciones of condicionesPorAlumna) {
    const activas = condicionesActivas(condiciones);
    if (activas.length === 0) continue;
    conCondiciones++;

    const nivel = semaforo(condiciones);
    if (nivel === 'ROJO') semaforos.rojo++;
    else if (nivel === 'AMBAR') semaforos.ambar++;

    const cats = new Set<CategoriaCondicion>();
    for (const c of activas) {
      cats.add(c.categoria);
      if (c.zona) zonas[c.zona] = (zonas[c.zona] ?? 0) + 1;
      for (const r of c.restricciones) restrCount.set(r, (restrCount.get(r) ?? 0) + 1);
      etiquetas.add(c.etiqueta.trim());
    }
    for (const cat of cats) categorias[cat] = (categorias[cat] ?? 0) + 1;
  }

  const restricciones = [...restrCount.entries()]
    .map(([codigo, n]) => ({ codigo, etiqueta: etiquetaRestriccion(codigo), n }))
    .sort((a, b) => b.n - a.n || a.codigo.localeCompare(b.codigo));

  return {
    totalAlumnas: condicionesPorAlumna.length,
    conCondiciones,
    semaforos,
    categorias,
    zonas,
    restricciones,
    etiquetas: [...etiquetas],
  };
}

// ─── Recordatorios de revisión (§10) — función pura, testeable ────────────────

export type MotivoRecordatorio = 'REVISION_VENCIDA' | 'SIN_REVISION';
export interface RecordatorioRevision { condicion: CondicionSalud; motivo: MotivoRecordatorio; dias: number }

/**
 * Condiciones activas que necesitan un recordatorio de revisión:
 *  - REVISION_VENCIDA: tienen `revisarEn` y ya pasó.
 *  - SIN_REVISION: no tienen `revisarEn` y llevan activas ≥ umbral (por defecto 90 días).
 * `dias` = días vencidos (REVISION_VENCIDA) o días activa sin revisión (SIN_REVISION).
 */
export function recordatoriosRevision(condiciones: CondicionSalud[], hoy: Date, umbralDias = 90): RecordatorioRevision[] {
  const out: RecordatorioRevision[] = [];
  for (const c of condicionesActivas(condiciones)) {
    if (c.revisarEn) {
      const d = diasDesde(c.revisarEn, hoy);
      if (d > 0) out.push({ condicion: c, motivo: 'REVISION_VENCIDA', dias: d });
    } else {
      const d = diasDesde(c.inicio, hoy);
      if (d >= umbralDias) out.push({ condicion: c, motivo: 'SIN_REVISION', dias: d });
    }
  }
  return out;
}

/**
 * Texto del aviso. Nombra a la socia pero NO la condición ni sus restricciones:
 * el detalle clínico queda en la ficha (gated §11); el feed de notificaciones es
 * más amplio. Suficiente para accionar el seguimiento sin filtrar el diagnóstico.
 */
export function textoRecordatorioRevision(nombreSocia: string, r: RecordatorioRevision): string {
  return r.motivo === 'REVISION_VENCIDA'
    ? `${nombreSocia}: revisión de ficha de salud vencida hace ${r.dias} días. Solicita una actualización.`
    : `${nombreSocia}: ficha de salud sin revisar desde hace ${r.dias} días. Pregúntale cómo evoluciona.`;
}
