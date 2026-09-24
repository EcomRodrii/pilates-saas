// ─────────────────────────────────────────────────────────────────────────────
// Qué empujón toca darle a un estudio que aún no ha llegado a su primera reserva.
//
// El embudo real de los estudios abiertos al público (23-sep): 7 altas, 5 sin
// ninguna clase programada, y de los 2 que sí la programaron, ninguno con una
// sola reserva. Son dos atascos distintos y cada uno pide su propio aviso:
//   · SIN_CLASES   — sin horario nadie puede reservar (a las 48 h).
//   · SIN_RESERVAS — el horario está hecho pero nadie ha reservado: casi siempre
//     porque el enlace no ha salido del panel (a las 72 h).
// Un solo aviso de cada tipo por estudio en toda su vida (lo garantiza el
// dedupKey del evento, no esta función).
//
// Regla pura, sin base de datos ni `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type AvisoEmbudo = 'SIN_CLASES' | 'SIN_RESERVAS';

export const HORAS_SIN_CLASES = 48;
export const HORAS_SIN_RESERVAS = 72;

export function avisoDeEmbudo(p: {
  creadoHaceHoras: number;
  sesiones: number;
  reservas: number;
  /** Una prueba ya cerrada tiene el panel bloqueado: «comparte tu enlace» no le sirve. */
  pruebaExpirada?: boolean;
}): AvisoEmbudo | null {
  if (p.sesiones === 0) return p.creadoHaceHoras >= HORAS_SIN_CLASES ? 'SIN_CLASES' : null;
  if (p.reservas === 0 && !p.pruebaExpirada && p.creadoHaceHoras >= HORAS_SIN_RESERVAS) return 'SIN_RESERVAS';
  return null;
}
