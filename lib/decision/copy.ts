// ─────────────────────────────────────────────────────────────────────────────
// Frases humanas del Decision OS. `ALTA`/`MEDIA`/`BAJA` es vocabulario de
// dentro del motor — nunca se muestra crudo a la propietaria (ni en la
// notificación ni en la UI). Ver "regla de lenguaje" del Umbral.
// ─────────────────────────────────────────────────────────────────────────────
import type { NivelConfianza } from './tipos.ts';

const FRASES: Record<NivelConfianza, string> = {
  ALTA: 'Estoy bastante segura.',
  MEDIA: 'Lo veo bien, pero es tu decisión.',
  BAJA: 'No lo haría todavía.',
};

export function fraseConfianza(nivel: NivelConfianza): string {
  return FRASES[nivel];
}
