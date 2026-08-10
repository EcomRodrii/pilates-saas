// ─────────────────────────────────────────────────────────────────────────────
// El Umbral — arbitraje del "mensaje único diario". Pura y determinista, igual
// que el resto del pipeline (motor.ts → prioridad.ts → conflictos.ts →
// umbral.ts). Reduce las candidatas ya puntuadas de hoy a UN SOLO mensaje, o
// a silencio — nunca dos el mismo día.
//
// Cinco puertas, TODAS deben pasar (si una falla, la candidata queda fuera):
//  1. Decae si se espera (urgencia real, no fabricada).
//  2. Necesita el criterio de la propietaria — si el piloto automático ya la
//     va a resolver sola este mismo ciclo, no compite por el mensaje de hoy.
//  3. Es la primera vez que se sabe (no repetir sin cambios materiales).
//  4. Hay una sola acción clara (estructural con el modelo de datos actual).
//  5. Compensa el impacto interrumpir por esto, relativo al TAMAÑO del
//     estudio (no un € fijo — 40€/mes es serio para una sala, ruido para una
//     cadena de 10 sedes).
//
// Si más de una candidata pasa las cinco puertas, se envía solo la de mayor
// `score` — el resto no se oculta, sigue viva para mañana (cooldown/expiración
// ya existentes en prioridad.ts/motor.ts se encargan de eso).
// ─────────────────────────────────────────────────────────────────────────────
import type { ContextoEstudio, Impacto, TipoRecomendacion } from './tipos.ts';
import type { CandidataPriorizada } from './prioridad.ts';

/** Registro de un mensaje (o silencio) ya emitido, para la puerta de novedad. */
export interface RegistroMensajeDia {
  dedupeKey: string | null;
  motivoMotor: string | null;
}

/** Cuántas veces un `tipo` fue el mensaje del día y cuántas se siguió de verdad
 *  (APROBADA/EJECUTADA) — base del Umbral adaptativo, ver `dbCalcularSeguimientoPorTipo`. */
export interface TasaSeguimiento {
  total: number;
  seguidas: number;
}

export type ResultadoUmbral =
  | { tipo: 'MENSAJE'; candidata: CandidataPriorizada }
  | { tipo: 'SILENCIO'; motivo: string };

// Heurística de partida (Fase 1): por debajo de esto, el sistema no está
// seguro de que actuar hoy cambie algo respecto a esperar unos días. Fase 2
// (abajo, `calibrarUmbral`) la ajusta por tipo según el historial real del
// propio estudio — este valor sigue siendo el punto de partida sin datos.
const URGENCIA_MINIMA_HOY = 0.45;

// € por socia activa y por sede al mes que hace falta para justificar una
// interrupción — no un € fijo. Punto de partida documentado, no una cifra
// definitiva.
const IMPACTO_MIN_EUR_POR_SOCIA_SEDE_MES = 0.05;

// Umbral adaptativo (Fase 2, ver tentare-os.md "El Umbral no es fijo"). Con
// menos de esto de historial DECIDIDO para un tipo, no hay señal suficiente
// para mover el listón — se queda en el punto de partida.
const MIN_MUESTRAS_PARA_CALIBRAR = 5;

// Impacto REAL medido por tipo (Pilar 3 de "Tentare 2030", ver
// dbCalcularImpactoRealPorTipo) — el subconjunto `confianza_medicion=MEDIDO`
// es un subconjunto de las ya "seguidas", así que exige más muestra que la
// puerta de urgencia antes de fiarse de él.
export interface ImpactoRealCalibracion {
  nMedido: number;
  promedioReal: number;
  promedioEstimadoOriginal: number;
}
const MIN_MUESTRAS_IMPACTO_REAL = 8;

/**
 * Ajusta el listón de urgencia/impacto para un `tipo` según su propio
 * historial de seguimiento en ESTE estudio — no un € o urgencia fijos para
 * todos. Si casi siempre se sigue, el Umbral exige un poco menos (esta
 * propietaria ya demostró que le importa); si casi nunca se sigue, exige más
 * (está gastando su atención en algo que no le compensa). Acotado en ambas
 * direcciones para no desbocarse con pocas muestras o una racha rara.
 *
 * `impactoRealPorTipo` (Fase 3, opcional): cuando hay evidencia REAL suficiente
 * de cuánto valió de verdad este tipo de recomendación, sustituye el
 * `impactoFactor` derivado de la tasa de seguimiento por uno derivado del
 * cociente € real / € estimado al crear — una corrección más directa sobre la
 * misma puerta (¿compensa el impacto?) con una señal más cercana a lo que esa
 * puerta pregunta. `urgenciaMin` NO se toca por esta fuente: sigue siendo
 * puramente comportamental, mezclar ambas puertas sería una abstracción
 * prematura para un caso que hoy no tiene datos que la justifiquen. Sin
 * muestra suficiente, cae exactamente al comportamiento de Fase 2 de hoy —
 * ningún estudio nuevo o pequeño cambia de comportamiento.
 */
export function calibrarUmbral(
  tipo: TipoRecomendacion,
  tasas: Map<TipoRecomendacion, TasaSeguimiento>,
  impactoRealPorTipo: Map<TipoRecomendacion, ImpactoRealCalibracion> = new Map(),
): { urgenciaMin: number; impactoFactor: number } {
  const t = tasas.get(tipo);
  const base = !t || t.total < MIN_MUESTRAS_PARA_CALIBRAR
    ? { urgenciaMin: URGENCIA_MINIMA_HOY, impactoFactor: 1 }
    : porTasaDeSeguimiento(t);

  const factorReal = factorDesdeImpactoReal(impactoRealPorTipo.get(tipo));
  return factorReal === null ? base : { urgenciaMin: base.urgenciaMin, impactoFactor: factorReal };
}

function porTasaDeSeguimiento(t: TasaSeguimiento): { urgenciaMin: number; impactoFactor: number } {
  const tasaSeguimiento = t.seguidas / t.total;
  if (tasaSeguimiento >= 0.8) {
    return { urgenciaMin: Math.max(0.30, URGENCIA_MINIMA_HOY - 0.10), impactoFactor: 0.6 };
  }
  if (tasaSeguimiento <= 0.3) {
    return { urgenciaMin: Math.min(0.65, URGENCIA_MINIMA_HOY + 0.15), impactoFactor: 2 };
  }
  return { urgenciaMin: URGENCIA_MINIMA_HOY, impactoFactor: 1 };
}

// Acotado [0.5, 2]× — mismo principio de "no desbocarse" que el resto de esta
// función: una sola racha de mediciones raras no puede disparar el factor.
function factorDesdeImpactoReal(c: ImpactoRealCalibracion | undefined): number | null {
  if (!c || c.nMedido < MIN_MUESTRAS_IMPACTO_REAL || c.promedioEstimadoOriginal <= 0) return null;
  const ratio = c.promedioReal / c.promedioEstimadoOriginal;
  return Math.min(2, Math.max(0.5, ratio));
}

function eurMesDe(impacto: Impacto): number | null {
  if (impacto.unidad === 'EUR_MES') return impacto.valor;
  if (impacto.unidad === 'EUR') return impacto.valor / 3; // mismo criterio que impactoNormalizado en prioridad.ts
  return null; // PCT_OCUPACION no tiene conversión a € limpia — no bloquea esta puerta
}

/** Puerta 5: ¿el impacto compensa, relativo al tamaño del estudio? `impactoFactor`
 *  viene de `calibrarUmbral` — 1 = sin calibrar, <1 exige menos, >1 exige más. */
export function impactoCompensa(impacto: Impacto | undefined, contexto: ContextoEstudio, impactoFactor = 1): boolean {
  if (!impacto) return true; // sin impacto medible (p.ej. carga de equipo) — no se descarta por esta puerta
  const eurMes = eurMesDe(impacto);
  if (eurMes === null) return true;
  const escala = Math.max(1, contexto.nSociasActivas) * Math.max(1, contexto.nSedesCadena);
  return eurMes / escala >= IMPACTO_MIN_EUR_POR_SOCIA_SEDE_MES * impactoFactor;
}

/** Puerta 3: ¿es la primera vez que se sabe, o ya se avisó sin cambios? */
export function esNovedad(candidata: CandidataPriorizada, historialReciente: RegistroMensajeDia[]): boolean {
  return !historialReciente.some(
    h => h.dedupeKey === candidata.dedupeKey && h.motivoMotor === candidata.motivoMotor
  );
}

/**
 * Arbitraje del día. `yaAutoResueltas` son los dedupeKey que el piloto
 * automático (autonomia.ts) ya seleccionó para ejecutarse solo en este mismo
 * ciclo — si el sistema ya lo va a resolver, no compite por el mensaje.
 * `tasasPorTipo` calibra las puertas 1 y 5 por tipo con el historial real de
 * este estudio (Fase 2) — vacío por defecto, mismo comportamiento que Fase 1.
 * `impactoRealPorTipo` (Fase 3, ver `calibrarUmbral`) refina la puerta 5 con
 * € realmente medidos cuando hay evidencia suficiente — vacío por defecto,
 * mismo comportamiento que Fase 2.
 */
export function elegirMensajeDelDia(
  candidatas: CandidataPriorizada[],
  contexto: ContextoEstudio,
  historialReciente: RegistroMensajeDia[],
  yaAutoResueltas: Set<string> = new Set(),
  tasasPorTipo: Map<TipoRecomendacion, TasaSeguimiento> = new Map(),
  impactoRealPorTipo: Map<TipoRecomendacion, ImpactoRealCalibracion> = new Map(),
): ResultadoUmbral {
  const elegibles = candidatas.filter(c => {
    const { urgenciaMin, impactoFactor } = calibrarUmbral(c.tipo, tasasPorTipo, impactoRealPorTipo);
    if (c.urgencia < urgenciaMin) return false;                         // 1. decae si se espera
    if (yaAutoResueltas.has(c.dedupeKey)) return false;                 // 2. necesita criterio humano
    if (!esNovedad(c, historialReciente)) return false;                 // 3. primera vez que se sabe
    if (!c.accion) return false;                                       // 4. una acción clara (estructural)
    if (!impactoCompensa(c.impacto, contexto, impactoFactor)) return false; // 5. compensa el impacto
    return true;
  });

  if (elegibles.length === 0) {
    return { tipo: 'SILENCIO', motivo: candidatas.length === 0 ? 'sin_candidatas' : 'ninguna_supera_el_umbral' };
  }

  const ganadora = [...elegibles].sort((a, b) => b.score - a.score)[0];
  return { tipo: 'MENSAJE', candidata: ganadora };
}
