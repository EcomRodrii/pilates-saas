// ─────────────────────────────────────────────────────────────────────────────
// Calendario — qué acción toca a una clase según su estado (la usa «Hoy en el
// estudio», lib/hoy-agenda.ts) y sobre qué reservas se pasa lista. Puro: decide;
// las escrituras (`checkin`, `marcarNoShow`…) viven en lib/studio-context.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoSesion } from './calendario-estado.ts';

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

// Pasar lista marcando solo a quien NO vino: las demás vinieron. Antes «Pasar
// lista» daba por venidas a TODAS de un toque, y quien faltó salía como que
// vino (con sus créditos y su racha) sin que nadie lo hubiera dicho. Sobre las
// mismas reservas que `reservasParaPasarLista`, para que guardar y deshacer
// actúen sobre el mismo conjunto.
export function planPasarLista(
  reservas: { id: string; estado: string; checkInEn: string | null }[],
  noVinieron: ReadonlySet<string>,
): { vinieron: string[]; noVinieron: string[] } {
  const pendientes = reservasParaPasarLista(reservas);
  return {
    vinieron: pendientes.filter(id => !noVinieron.has(id)),
    noVinieron: pendientes.filter(id => noVinieron.has(id)),
  };
}
