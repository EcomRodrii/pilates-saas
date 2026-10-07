// ─────────────────────────────────────────────────────────────────────────────
// Qué se guarda (y qué NO) cuando alguien pide que la llamemos.
//
// Regla de fondo: el teléfono solo existe si la persona lo da Y lo consiente.
// Quien elige otra ayuda («Lo configuro yo», «Configuradlo por mí») no deja
// teléfono aquí aunque el cliente lo mandara por error: se descarta.
//
// Puro y sin `@/`. Lo comparten el asistente (para saber si pedir el teléfono)
// y la ruta del servidor (para decidir si guardar).
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarTelefono } from './telefono.ts';

/** La etiqueta de la opción. Es el MISMO dato que pinta el asistente. */
export const AYUDA_LLAMADA = 'Prefiero que me llamen';
export const AYUDA_YO = 'Lo configuro yo';
export const AYUDA_POR_MI = 'Configuradlo por mí';
export const OPCIONES_AYUDA = [AYUDA_YO, AYUDA_LLAMADA, AYUDA_POR_MI] as const;

/** Lo que de verdad pide ayuda humana y por tanto avisa al equipo. */
export const AYUDAS_QUE_AVISAN: ReadonlySet<string> = new Set([AYUDA_LLAMADA, AYUDA_POR_MI]);

export const CONSENTIMIENTO_LLAMADA = 'Te llamamos solo para ayudarte con tu alta, una vez. Sin comerciales.';

export const HORAS_PREFERIDAS = ['manana', 'tarde'] as const;
export type HoraPreferida = (typeof HORAS_PREFERIDAS)[number];
export const ETIQUETA_HORA: Record<HoraPreferida, string> = { manana: 'Por la mañana', tarde: 'Por la tarde' };

export interface EntradaLlamada {
  ayuda?: unknown;
  prefijo?: unknown;
  telefono?: unknown;
  consentimiento?: unknown;
  horaPreferida?: unknown;
}

export type DecisionLlamada =
  /** No es una llamada: nada que guardar. */
  | { tipo: 'no-aplica' }
  | { tipo: 'invalida'; error: string }
  | { tipo: 'guardar'; e164: string; horaPreferida: HoraPreferida | null };

export function decidirLlamada(e: EntradaLlamada): DecisionLlamada {
  if (e.ayuda !== AYUDA_LLAMADA) return { tipo: 'no-aplica' };
  // Sin casilla marcada no hay consentimiento, y sin consentimiento no hay
  // teléfono guardado: ni «a medias».
  if (e.consentimiento !== true) {
    return { tipo: 'invalida', error: 'Marca la casilla para que podamos llamarte.' };
  }
  const r = normalizarTelefono(
    typeof e.prefijo === 'string' ? e.prefijo : '',
    typeof e.telefono === 'string' ? e.telefono : '',
  );
  if (!r.ok) return { tipo: 'invalida', error: r.error };
  const hora = (HORAS_PREFERIDAS as readonly unknown[]).includes(e.horaPreferida)
    ? (e.horaPreferida as HoraPreferida)
    : null;
  return { tipo: 'guardar', e164: r.e164, horaPreferida: hora };
}
