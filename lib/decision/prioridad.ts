// Priority Engine (DECISION-OS-NUCLEO.md §6-7). Cooldowns por dedupeKey,
// ajuste de aprendizaje por feedback, score multiplicativo, cortes de
// prioridad y los caps que la Bible exige (≤3 críticas, ≤2 por especialista
// en el bloque Prioridades).
import type { Candidata, EspecialistaId, Impacto, NivelConfianza, Prioridad, Recomendacion, Riesgo, TipoRecomendacion } from './tipos.ts';

export const PESOS = {
  impactoSaturacionEur: 500,
  impactoSinDato: 0.25,
  confianzaFactor: { ALTA: 1.0, MEDIA: 0.7, BAJA: 0.4 } as Record<NivelConfianza, number>,
  corteCritica: 70,
  corteAlta: 45,
  corteMedia: 25,
  capCriticasGlobal: 3,
  capPorEspecialistaEnPrioridades: 2,
  capPrioridadesHome: 3,
  ajusteFeedbackPiso: 0.7,
  ajusteFeedbackPorRechazo: 0.1,
};

/** Cooldown por tipo (Núcleo §6.2) — EXPIRADA cuenta la mitad de la ventana. */
const COOLDOWN_DIAS: Record<TipoRecomendacion, number> = {
  RECUPERAR_SOCIA: 21,
  ENVIAR_REACTIVACION: 30,
  CONGELAR_MEMBRESIA: 30,
  ABRIR_SESION: 14,
  RECUPERAR_PAGOS: 3,
  PROPONER_RENOVACION_BONO: 14,
  REVISAR_PRECIO: 30,
  COBRAR_PENDIENTE: 3,
  MOVER_HORARIO: 14,
  FUSIONAR_SESIONES: 14,
  PREPARAR_CAMPANA: 14,
  CONTACTAR_LEAD: 10,
  CONVERTIR_PRUEBA: 10,
};

const MS_DIA = 86400000;

/**
 * ¿Esta candidata (por dedupeKey) se resolvió recientemente y sigue en cooldown?
 * Incluye EJECUTADA: si el propietario YA gestionó la recomendación (aprobó
 * "llamar a Marta", revisar el horario…), NO se la volvemos a proponer al día
 * siguiente aunque el hecho siga presente — antes solo RECHAZADA/EXPIRADA
 * entraban en cooldown, así que aprobar una recomendación no la silenciaba y
 * reaparecía en cada análisis (parecía que "aprobar no hacía nada"). EXPIRADA
 * cuenta media ventana; RECHAZADA y EJECUTADA la completa.
 */
export function enCooldown(candidata: Candidata, resueltas90d: Recomendacion[], now: Date): boolean {
  const dias = COOLDOWN_DIAS[candidata.tipo] ?? 0;
  if (dias === 0) return false;
  return resueltas90d.some(r => {
    if (r.dedupeKey !== candidata.dedupeKey) return false;
    if (r.estado !== 'RECHAZADA' && r.estado !== 'EXPIRADA' && r.estado !== 'EJECUTADA') return false;
    if (!r.resueltoEn) return false;
    const ventana = r.estado === 'EXPIRADA' ? dias / 2 : dias;
    const diasTranscurridos = (now.getTime() - new Date(r.resueltoEn).getTime()) / MS_DIA;
    return diasTranscurridos < ventana;
  });
}

/**
 * Aprendizaje determinista suave (Núcleo §6.2): cada RECHAZADA del mismo tipo
 * resta 10% al score de futuras candidatas de ese tipo, con piso 0.7×. Se
 * restaura por completo en cuanto una del mismo tipo llega a EJECUTADA.
 */
export function calcularAjusteFeedback(tipo: TipoRecomendacion, resueltas90d: Recomendacion[]): number {
  const delTipo = [...resueltas90d]
    .filter(r => r.tipo === tipo)
    .sort((a, b) => (a.resueltoEn ?? '').localeCompare(b.resueltoEn ?? ''));
  let rechazos = 0;
  for (const r of delTipo) {
    if (r.estado === 'EJECUTADA') rechazos = 0;
    else if (r.estado === 'RECHAZADA') rechazos++;
  }
  return Math.max(PESOS.ajusteFeedbackPiso, 1 - PESOS.ajusteFeedbackPorRechazo * rechazos);
}

function impactoNormalizado(impacto: Impacto | undefined): number {
  if (!impacto) return PESOS.impactoSinDato;
  const eurMes = impacto.unidad === 'EUR' ? impacto.valor / 3 : impacto.valor;
  return Math.min(1, Math.log10(1 + Math.max(0, eurMes)) / Math.log10(1 + PESOS.impactoSaturacionEur));
}

/** Score multiplicativo 0-100 (Núcleo §7.2): una candidata floja en cualquier eje no se cuela arriba a base de otro. */
export function calcularScore(candidata: Candidata, ajusteFeedback: number): number {
  const impactoNorm = impactoNormalizado(candidata.impacto);
  const confianzaFactor = PESOS.confianzaFactor[candidata.confianza.nivel];
  const urgenciaFactor = 0.5 + 0.5 * candidata.urgencia;
  const esfuerzoFactor = 1 - 0.3 * candidata.esfuerzo;
  return 100 * impactoNorm * confianzaFactor * urgenciaFactor * esfuerzoFactor * ajusteFeedback;
}

/** Confianza BAJA nunca supera MEDIA (Núcleo §5.1): jamás entra en el bloque Prioridades. */
export function calcularPrioridad(score: number, riesgo: Riesgo, confianza: NivelConfianza): Prioridad {
  if (confianza === 'BAJA') return score >= PESOS.corteMedia ? 'MEDIA' : 'BAJA';
  if (score >= PESOS.corteCritica && riesgo === 'PERDIDA') return 'CRITICA';
  if (score >= PESOS.corteAlta) return 'ALTA';
  if (score >= PESOS.corteMedia) return 'MEDIA';
  return 'BAJA';
}

export interface CandidataPriorizada extends Candidata {
  score: number;
  prioridad: Prioridad;
}

// Estructural, no CandidataPriorizada exacta: así la reutiliza también la API
// (GET /api/decisiones) ordenando Recomendacion[] ya persistidas, sin duplicar
// esta lógica (Arquitectura §7).
interface ConPrioridad {
  score: number;
  riesgo: Riesgo;
  prioridad: Prioridad;
  especialista: EspecialistaId;
}

function compararParaOrden<T extends ConPrioridad>(a: T, b: T): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.riesgo !== b.riesgo) return a.riesgo === 'PERDIDA' ? -1 : 1;
  return 0; // desempate final por creadoEn — se asigna en motor.ts al persistir
}

/** Cap global ≤3 CRITICA (Núcleo §7.3): el excedente degrada a ALTA, por score descendente. */
function aplicarCapCritica(puntuadas: CandidataPriorizada[]): CandidataPriorizada[] {
  const criticas = puntuadas.filter(c => c.prioridad === 'CRITICA').sort(compararParaOrden);
  if (criticas.length <= PESOS.capCriticasGlobal) return puntuadas;
  const exceso = new Set(criticas.slice(PESOS.capCriticasGlobal).map(c => c.dedupeKey));
  return puntuadas.map(c => (exceso.has(c.dedupeKey) && c.prioridad === 'CRITICA' ? { ...c, prioridad: 'ALTA' as const } : c));
}

/**
 * Pipeline completo del Priority Engine: filtra cooldowns, puntúa, asigna
 * prioridad y aplica el cap global de críticas. No decide qué se muestra en
 * la Home — eso es `seleccionarPrioridadesHome`.
 */
export function priorizar(candidatas: Candidata[], resueltas90d: Recomendacion[], now: Date): CandidataPriorizada[] {
  const vivas = candidatas.filter(c => !enCooldown(c, resueltas90d, now));
  const puntuadas: CandidataPriorizada[] = vivas.map(c => {
    const ajuste = calcularAjusteFeedback(c.tipo, resueltas90d);
    const score = calcularScore(c, ajuste);
    const prioridad = calcularPrioridad(score, c.riesgo, c.confianza.nivel);
    return { ...c, score, prioridad };
  });
  return aplicarCapCritica(puntuadas);
}

/**
 * Bloque "Prioridades" de la Home (Bible doc 4): exactamente las CRITICA +
 * mejores ALTA, hasta 3 tarjetas, con tope de 2 por especialista para que
 * ninguno monopolice la Home.
 */
export function seleccionarPrioridadesHome<T extends ConPrioridad>(puntuadas: T[]): T[] {
  const elegibles = puntuadas.filter(c => c.prioridad === 'CRITICA' || c.prioridad === 'ALTA').sort(compararParaOrden);
  const resultado: T[] = [];
  const porEspecialista = new Map<string, number>();
  for (const c of elegibles) {
    if (resultado.length >= PESOS.capPrioridadesHome) break;
    const count = porEspecialista.get(c.especialista) ?? 0;
    if (count >= PESOS.capPorEspecialistaEnPrioridades) continue;
    resultado.push(c);
    porEspecialista.set(c.especialista, count + 1);
  }
  return resultado;
}
