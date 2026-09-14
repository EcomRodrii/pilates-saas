// ─────────────────────────────────────────────────────────────────────────────
// Chat 1:1 de la instructora con sus alumnas desde la app del estudio: tipos y
// textos que comparten servidor y pantallas. Puro.
//
// Decisiones del fundador (14-sep-2026): reutiliza las conversaciones
// `ALUMNA_INSTRUCTORA` que ya existían; solo se ABRE con una alumna suya (±30
// días, `instructoraAtiendeSocia`); un hilo ya abierto se sigue respondiendo
// mientras la instructora siga activa; de la alumna, nombre corto y foto.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConversacionConResumen } from '../mensajeria/presentacion.ts';

export interface AlumnaDelHilo {
  socioId: string;
  /** Nombre e inicial del apellido, como en «Tus alumnas». */
  nombre: string;
  fotoUrl: string | null;
}

export type HiloInstructora = ConversacionConResumen & { alumna: AlumnaDelHilo | null };

/** Por qué no se puede empezar una conversación con esta alumna. */
export type MotivoNoAbrir = 'SIN_CUENTA' | 'SIN_CLASE_CONFIRMADA';

export function textoNoAbrir(motivo: MotivoNoAbrir): string {
  return motivo === 'SIN_CUENTA'
    ? 'Esta alumna todavía no usa la app, así que no puede recibir mensajes.'
    : 'Podrás escribirle cuando tenga una clase confirmada contigo.';
}
