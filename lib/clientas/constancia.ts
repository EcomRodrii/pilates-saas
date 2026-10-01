// Constancia de una clienta: cuántas clases ha hecho cada semana (lunes a
// domingo, hora del estudio) en las últimas N semanas, la actual incluida.
//
// Puro: se prueba con `node --test`.
import { hoyEnEstudio } from '../utils.ts';

const MS_DIA = 86_400_000;

// El formateador de `hoyEnEstudio` se construye una vez; aquí era uno por clase.
function diaEstudio(iso: string, tz: string): string {
  return hoyEnEstudio(new Date(iso), tz);
}

/** Lunes ('YYYY-MM-DD') de la semana de ese día. */
function lunesDe(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(d.getTime() - dow * MS_DIA).toISOString().slice(0, 10);
}

export interface Constancia {
  /** Clases por semana, de la más antigua a la actual. */
  semanas: number[];
  /** Media semanal de las semanas en las que ya era clienta y vino alguna vez (null sin datos). */
  media: number | null;
  /** Semanas seguidas sin venir hasta hoy (la actual incluida). */
  semanasSinVenir: number;
}

export function constancia(asistencias: readonly string[], ahora: Date, n = 12, tz = 'Europe/Madrid'): Constancia {
  const lunesHoy = lunesDe(diaEstudio(ahora.toISOString(), tz));
  const lunes = Array.from({ length: n }, (_, i) =>
    new Date(new Date(`${lunesHoy}T12:00:00Z`).getTime() - (n - 1 - i) * 7 * MS_DIA).toISOString().slice(0, 10));
  const indice = new Map(lunes.map((l, i) => [l, i]));
  const semanas = new Array<number>(n).fill(0);
  const ahoraIso = ahora.toISOString();
  for (const iso of asistencias) {
    if (iso > ahoraIso) continue;
    const i = indice.get(lunesDe(diaEstudio(iso, tz)));
    if (i !== undefined) semanas[i]++;
  }
  const primera = semanas.findIndex(x => x > 0);
  const tramo = primera < 0 ? [] : semanas.slice(primera);
  const media = tramo.length > 0 ? Math.round((tramo.reduce((a, b) => a + b, 0) / tramo.length) * 10) / 10 : null;
  let semanasSinVenir = 0;
  for (let i = n - 1; i >= 0 && semanas[i] === 0; i--) semanasSinVenir++;
  return { semanas, media, semanasSinVenir };
}

/**
 * Cuántas clases tiene ESTA semana (lunes a domingo, hora del estudio), vengan
 * ya hechas o reservadas: lo que cuenta contra un plan de «N por semana».
 */
export function clasesEstaSemana(inicios: readonly string[], ahora: Date, tz = 'Europe/Madrid'): number {
  const lunesHoy = lunesDe(diaEstudio(ahora.toISOString(), tz));
  return inicios.filter(iso => lunesDe(diaEstudio(iso, tz)) === lunesHoy).length;
}
