// Moderación de la app (App Store 1.2) — las reglas puras que comparten las
// rutas de las apps y del panel. Sin I/O, sin React, sin `@/`: se prueban con
// `node --test` (imports relativos con `.ts`).
//
// La cerradura real está en la base de datos (migr 20261005150100):
//   · el trigger `trg_mensajes_conversacion_abierta` impide escribir en un hilo
//     cerrado o bloqueado, venga por donde venga, y lanza
//     CONVERSACION_CERRADA / CONVERSACION_BLOQUEADA;
//   · `resolver_denuncia` decide quién puede revisar y aplica la decisión.
// Esto solo traduce lo que la base de datos ya decidió y le ahorra a la ruta un
// viaje cuando ya sabe que el hilo no admite mensajes.

/** Lo que leen en la app la alumna y la instructora en lugar de un mensaje retirado. */
export const TEXTO_RETIRADO = 'Mensaje retirado por el estudio';

/** Escribir en un hilo cerrado o bloqueado, desde la app. */
export const TEXTO_NO_ADMITE = 'Esta conversación ya no admite mensajes.';

/** El panel, escribiendo en un hilo que el estudio cerró. */
export const TEXTO_CERRADA_PANEL = 'Esta conversación está cerrada: ya no admite mensajes.';

/**
 * El panel, cuando quien escribe tiene un bloqueo con esa alumna en su chat de la
 * app (también si intenta rodearlo por el hilo del estudio).
 */
export const TEXTO_BLOQUEO_PANEL =
  'No puedes escribirle: hay un bloqueo entre vosotras en el chat de la app. Que le escriba otra persona del estudio.';

/**
 * Horas que tiene el estudio para revisar una denuncia antes de que la pueda
 * resolver Tentare. Es la MISMA cifra que `resolver_denuncia` en SQL
 * (`interval '24 hours'`): un test las cruza.
 */
export const HORAS_REVISION_ESTUDIO = 24;

/**
 * Opción prudente mientras no haya dictamen sobre menores (duda abierta,
 * 5-oct-2026): con una alumna menor de 14 no se abre un chat con instructora.
 */
export const TEXTO_MENOR_CHAT = 'Con alumnas menores de 14 años, los mensajes van por el estudio.';

// ── Mensajes ─────────────────────────────────────────────────────────────────

/** Lo mínimo de un mensaje leído de la base. */
export interface MensajeConModeracion {
  cuerpo: string;
  oculto_en?: string | null;
  oculto_por?: string | null;
}

export type MensajeParaApp<T extends MensajeConModeracion> = Omit<T, 'oculto_en' | 'oculto_por'> & { oculto: boolean };

/**
 * Un mensaje tal como sale hacia las apps: si el estudio lo retiró, sin el texto
 * (ni siquiera a quien lo escribió) y con `oculto: true`. Nunca viaja quién lo
 * retiró.
 */
export function mensajeParaApp<T extends MensajeConModeracion>(m: T): MensajeParaApp<T> {
  const oculto = Boolean(m.oculto_en);
  const resto = Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'oculto_en' && k !== 'oculto_por'));
  return { ...resto, cuerpo: oculto ? TEXTO_RETIRADO : m.cuerpo, oculto } as MensajeParaApp<T>;
}

// ── Estado de un hilo ────────────────────────────────────────────────────────

/**
 * - `ABIERTA`: se puede escribir.
 * - `BLOQUEADA_POR_MI`: quien pregunta bloqueó a la otra parte (podrá
 *   desbloquear cuando haya pantalla).
 * - `NO_ADMITE`: el estudio lo cerró o la otra parte bloqueó. No se dice cuál:
 *   a quien han bloqueado no se le cuenta.
 */
export type EstadoHilo = 'ABIERTA' | 'BLOQUEADA_POR_MI' | 'NO_ADMITE';

export interface ParticipanteHilo {
  rol_en_conversacion: string;
  auth_user_id: string | null;
  socio_id: string | null;
  bloqueo_en?: string | null;
}

/** Quién pregunta: la alumna por su ficha (su cuenta puede no estar en la fila), el equipo por su cuenta. */
export interface YoEnElHilo {
  authUserId?: string | null;
  socioId?: string | null;
}

function soyYo(p: ParticipanteHilo, yo: YoEnElHilo): boolean {
  if (yo.socioId && p.rol_en_conversacion === 'SOCIO' && p.socio_id === yo.socioId) return true;
  return Boolean(yo.authUserId) && p.auth_user_id === yo.authUserId;
}

export function estadoDelHilo(h: {
  tipo: string;
  cerradaEn: string | null | undefined;
  participantes: readonly ParticipanteHilo[];
  yo: YoEnElHilo;
}): EstadoHilo {
  if (h.cerradaEn) return 'NO_ADMITE';
  const bloqueos = h.participantes.filter((p) => p.bloqueo_en);
  if (bloqueos.length === 0) return 'ABIERTA';
  // Si las dos partes se bloquearon, manda que la otra lo hizo: desbloquear lo
  // mío no lo abriría.
  return bloqueos.every((p) => soyYo(p, h.yo)) ? 'BLOQUEADA_POR_MI' : 'NO_ADMITE';
}

// ── Errores de la base de datos ──────────────────────────────────────────────

export interface ErrorModeracion {
  status: 409;
  error: string;
  estado: EstadoHilo;
  /** El código que lanzó la base de datos. */
  codigo: 'CONVERSACION_CERRADA' | 'CONVERSACION_BLOQUEADA';
}

/**
 * Traduce el error del trigger a un 409. `null` si es cualquier otro error (y
 * entonces quien llama sigue con su camino de siempre). Las apps reciben la
 * misma frase en los dos casos; el panel, la suya en cada uno.
 */
export function errorDeModeracion(err: unknown, opciones: { panel?: boolean } = {}): ErrorModeracion | null {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  const mensaje = typeof e.message === 'string' ? e.message : '';
  if (e.code !== 'P0001') return null;
  const codigo = mensaje.includes('CONVERSACION_CERRADA') ? 'CONVERSACION_CERRADA'
    : mensaje.includes('CONVERSACION_BLOQUEADA') ? 'CONVERSACION_BLOQUEADA'
      : null;
  if (!codigo) return null;
  const error = !opciones.panel ? TEXTO_NO_ADMITE
    : codigo === 'CONVERSACION_CERRADA' ? TEXTO_CERRADA_PANEL : TEXTO_BLOQUEO_PANEL;
  return { status: 409, error, estado: 'NO_ADMITE', codigo };
}
