// ─────────────────────────────────────────────────────────────────────────────
// Cómo ve la instructora su nota en la app del estudio. Puro.
//
// Lo que llega del servidor ya es el agregado protegido
// (`lib/valoraciones/agregado.ts`): meses cerrados, bloques de al menos 5
// alumnas distintas. Aquí solo se valida la forma y se escribe: la media con un
// decimal y SIEMPRE con su número de valoraciones, y hasta cuándo son los datos.
// Nunca comentarios (decisión del 14-sep-2026).
// ─────────────────────────────────────────────────────────────────────────────

export interface ValoracionesVista {
  /** Media de 1 a 5. */
  media: number;
  /** Cuántas valoraciones la sostienen. */
  total: number;
  /** Último día (YYYY-MM-DD) de los datos publicados. */
  hasta: string;
}

export const TEXTO_SIN_VALORACIONES = 'Cuando al menos 5 alumnas hayan valorado tus clases, verás aquí tu media.';

const fmtDia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Nunca da por buena una forma que no sea exactamente la esperada. */
export function normalizarValoraciones(x: unknown): ValoracionesVista | null {
  if (!x || typeof x !== 'object') return null;
  const v = x as Record<string, unknown>;
  if (typeof v.media !== 'number' || !Number.isFinite(v.media) || v.media < 1 || v.media > 5) return null;
  if (typeof v.total !== 'number' || !Number.isInteger(v.total) || v.total < 1) return null;
  if (typeof v.hasta !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.hasta)) return null;
  return { media: v.media, total: v.total, hasta: v.hasta };
}

/** «4,6 · 38 valoraciones» y «Datos hasta el 31 de agosto», o `null` si no hay nota. */
export function textoValoraciones(v: ValoracionesVista | null): { nota: string; hasta: string } | null {
  if (!v) return null;
  const media = (Math.round(v.media * 10) / 10).toFixed(1).replace('.', ',');
  const nota = `${media} · ${v.total} ${v.total === 1 ? 'valoración' : 'valoraciones'}`;
  const dia = new Date(`${v.hasta}T12:00:00Z`);
  return { nota, hasta: Number.isNaN(dia.getTime()) ? '' : `Datos hasta el ${fmtDia.format(dia)}` };
}
