// ─────────────────────────────────────────────────────────────────────────────
// La semana de la instructora: el resumen de «Hoy» y los días de la agenda.
//
// Puro y sin dependencias: se prueba con `node --test`. Las fechas son días del
// estudio en ISO (`YYYY-MM-DD`, ya en su zona) y se opera sobre ellas a mediodía
// UTC, así que un cambio de hora no mueve ningún día.
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** El lunes de la semana de ese día (la semana va de lunes a domingo). */
export function lunesDe(iso: string): string {
  const diaSemana = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(iso, -((diaSemana + 6) % 7));
}

export function domingoDe(iso: string): string {
  return sumarDias(lunesDe(iso), 6);
}

/** Lo mínimo de una clase que da para contarla. */
export interface ClaseContable {
  fecha: string;
  inicio: string;
  fin: string;
  confirmadas: number;
  cancelada: boolean;
}

export interface ResumenSemana {
  /** Clases de lunes a domingo, sin las canceladas. */
  clases: number;
  /** Lo que suman, en minutos. */
  minutos: number;
  /** Plazas ocupadas en todas ellas (una alumna que viene dos veces cuenta dos). */
  plazasOcupadas: number;
  /** Las que aún no han terminado. Sin reloj (antes de hidratar), todas. */
  quedan: number;
}

export function resumenSemana(clases: readonly ClaseContable[], hoy: string, ahoraMs: number | null): ResumenSemana {
  const lunes = lunesDe(hoy);
  const domingo = domingoDe(hoy);
  const deLaSemana = clases.filter((c) => !c.cancelada && c.fecha >= lunes && c.fecha <= domingo);
  return {
    clases: deLaSemana.length,
    minutos: deLaSemana.reduce((s, c) => s + Math.max(0, Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / 60_000)), 0),
    plazasOcupadas: deLaSemana.reduce((s, c) => s + Math.max(0, c.confirmadas), 0),
    quedan: ahoraMs == null ? deLaSemana.length : deLaSemana.filter((c) => Date.parse(c.fin) > ahoraMs).length,
  };
}

/**
 * Las horas de la semana como cifra corta y su rótulo: «55» + «min de clase»,
 * «1» + «hora de clase», «5,5» + «horas de clase». Corta a propósito: «5 h 30
 * min» se partía en dos líneas en la columna de un móvil.
 */
export function cifraDuracion(minutos: number): { valor: string; texto: string } {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return { valor: String(m), texto: 'min de clase' };
  const horas = Math.round((m / 60) * 10) / 10;
  return {
    valor: horas.toLocaleString('es-ES', { maximumFractionDigits: 1 }),
    texto: horas === 1 ? 'hora de clase' : 'horas de clase',
  };
}

/**
 * Los `dias` días a partir de `desde`, cada uno con lo suyo, EN ORDEN y
 * también los que no tienen nada: en la agenda un día libre se enseña como
 * libre, no desaparece.
 */
export function agruparPorDia<T>(filas: readonly T[], fechaDe: (fila: T) => string, desde: string, dias: number): { fecha: string; filas: T[] }[] {
  return Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(desde, i);
    return { fecha, filas: filas.filter((f) => fechaDe(f) === fecha) };
  });
}
