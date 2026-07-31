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
import type { ContextoEstudio, Impacto } from './tipos.ts';
import type { CandidataPriorizada } from './prioridad.ts';

/** Registro de un mensaje (o silencio) ya emitido, para la puerta de novedad. */
export interface RegistroMensajeDia {
  dedupeKey: string | null;
  motivoMotor: string | null;
}

export type ResultadoUmbral =
  | { tipo: 'MENSAJE'; candidata: CandidataPriorizada }
  | { tipo: 'SILENCIO'; motivo: string };

// Heurística de partida (Fase 1, sin aprendizaje adaptativo todavía — ver
// tentare-os.md "Umbral no es fijo"): por debajo de esto, el sistema no está
// seguro de que actuar hoy cambie algo respecto a esperar unos días.
const URGENCIA_MINIMA_HOY = 0.45;

// € por socia activa y por sede al mes que hace falta para justificar una
// interrupción — no un € fijo. Punto de partida documentado, no una cifra
// definitiva: se recalibrará con datos reales de aceptación/descarte.
const IMPACTO_MIN_EUR_POR_SOCIA_SEDE_MES = 0.05;

function eurMesDe(impacto: Impacto): number | null {
  if (impacto.unidad === 'EUR_MES') return impacto.valor;
  if (impacto.unidad === 'EUR') return impacto.valor / 3; // mismo criterio que impactoNormalizado en prioridad.ts
  return null; // PCT_OCUPACION no tiene conversión a € limpia — no bloquea esta puerta
}

/** Puerta 5: ¿el impacto compensa, relativo al tamaño del estudio? */
export function impactoCompensa(impacto: Impacto | undefined, contexto: ContextoEstudio): boolean {
  if (!impacto) return true; // sin impacto medible (p.ej. carga de equipo) — no se descarta por esta puerta
  const eurMes = eurMesDe(impacto);
  if (eurMes === null) return true;
  const escala = Math.max(1, contexto.nSociasActivas) * Math.max(1, contexto.nSedesCadena);
  return eurMes / escala >= IMPACTO_MIN_EUR_POR_SOCIA_SEDE_MES;
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
 */
export function elegirMensajeDelDia(
  candidatas: CandidataPriorizada[],
  contexto: ContextoEstudio,
  historialReciente: RegistroMensajeDia[],
  yaAutoResueltas: Set<string> = new Set(),
): ResultadoUmbral {
  const elegibles = candidatas.filter(c => {
    if (c.urgencia < URGENCIA_MINIMA_HOY) return false;               // 1. decae si se espera
    if (yaAutoResueltas.has(c.dedupeKey)) return false;                 // 2. necesita criterio humano
    if (!esNovedad(c, historialReciente)) return false;                 // 3. primera vez que se sabe
    if (!c.accion) return false;                                       // 4. una acción clara (estructural)
    if (!impactoCompensa(c.impacto, contexto)) return false;            // 5. compensa el impacto
    return true;
  });

  if (elegibles.length === 0) {
    return { tipo: 'SILENCIO', motivo: candidatas.length === 0 ? 'sin_candidatas' : 'ninguna_supera_el_umbral' };
  }

  const ganadora = [...elegibles].sort((a, b) => b.score - a.score)[0];
  return { tipo: 'MENSAJE', candidata: ganadora };
}
