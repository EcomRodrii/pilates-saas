// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 3 (franja de decisiones) y punto 4 (una
// acción por estado). Puro: decide QUÉ acción toca y en qué orden se recorren
// las clases que piden decisión — nada de IO ni de React aquí.
// ─────────────────────────────────────────────────────────────────────────────

import { pideDecision, type EstadoSesion } from './calendario-estado.ts';

export interface ItemDecision {
  sesionId: string;
  estado: EstadoSesion;
  /** Orden del día dentro del rango visible (0 en vista de Día; 0-6 en Semana). */
  dia: number;
  inicioMin: number;
  enEspera: number;
  sobreaforo: number;
  /** aforoMaximo - confirmadas, nunca negativo. Ver nota en calendario-estado.ts:pideDecision. */
  huecosLibres: number;
  /** La clase ya terminó — ver nota en calendario-estado.ts:pideDecision. */
  finalizada: boolean;
}

// Mismo orden que `pideDecision` respeta internamente (gravedad), y dentro de
// eso, cronológico — para que "1 de 7" siga un orden que tiene sentido para
// quien las recorre con ‹ ›.
export function decisionesOrdenadas<T extends ItemDecision>(items: T[]): T[] {
  return items
    .filter(i => pideDecision(i.estado, { enEspera: i.enEspera, sobreaforo: i.sobreaforo, huecosLibres: i.huecosLibres, finalizada: i.finalizada }))
    .sort((a, b) => (a.dia - b.dia) || (a.inicioMin - b.inicioMin));
}

export type TipoAccion = 'CUBRIR' | 'PASAR_LISTA' | 'RESOLVER' | 'MOVER' | 'OFRECER' | 'AJUSTAR_AFORO';

// Mismo orden de prioridad que `estadoSesion`/`pideDecision`: lo más grave
// dicta la acción, aunque la sesión ADEMÁS tenga lista de espera o sobreaforo
// (esos dos solo mandan cuando no hay nada más grave que resolver primero).
// OFRECER solo si hay un hueco libre de verdad (huecosLibres > 0) — la RPC
// que resuelve esta acción (promocionar_siguiente_espera) no comprueba aforo
// por su cuenta, así que ofrecer sin hueco sería un oversell.
export function accionParaEstado(
  estado: EstadoSesion,
  o: { enEspera: number; sobreaforo: number; huecosLibres: number },
): TipoAccion | null {
  if (estado === 'SIN_INSTRUCTORA') return 'CUBRIR';
  if (estado === 'SIN_PASAR_LISTA') return 'PASAR_LISTA';
  if (estado === 'INCIDENCIA') return 'RESOLVER';
  if (estado === 'CONFLICTO') return 'MOVER';
  if (estado === 'CANCELADA') return null;
  if (o.enEspera > 0 && o.huecosLibres > 0) return 'OFRECER';
  if (o.sobreaforo > 0) return 'AJUSTAR_AFORO';
  return null;
}

// "Pasar lista" (y su Deshacer) actúan sobre el MISMO conjunto de reservas:
// las CONFIRMADA de esta sesión que nadie marcó con check-in. Se calcula aquí,
// puro, para que la acción y su reversión no puedan divergir por accidente —
// `marcarNoShow`/`revertirNoShow` (lib/studio-context.tsx) ya existen y hacen
// el escritura real, esto solo decide SOBRE QUÉ ids actuar.
export function reservasParaPasarLista(
  reservas: { id: string; estado: string; checkInEn: string | null }[],
): string[] {
  return reservas.filter(r => r.estado === 'CONFIRMADA' && !r.checkInEn).map(r => r.id);
}
