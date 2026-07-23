// ─────────────────────────────────────────────────────────────────────────────
// Aforo efectivo (F2 · B2.7). Lógica pura que ESPEJA a la función SQL
// aforo_efectivo(): capacidad real = aforo_maximo − máquinas averiadas que
// solapan la sesión. La verdad transaccional vive en la BD (reservar_plaza usa
// la función SQL); esto es para pintar el aforo real en el panel sin recargar.
// ─────────────────────────────────────────────────────────────────────────────

import type { BloqueoMaquina } from '@/lib/types';

// ¿Solapan [aDesde, aHasta) y [bDesde, bHasta)? hasta = null → avería abierta
// (sin fecha de arreglo) = solapa siempre hacia el futuro.
function solapan(aDesde: string, aHasta: string | null, bDesde: string, bHasta: string | null): boolean {
  const aFin = aHasta ? Date.parse(aHasta) : Number.POSITIVE_INFINITY;
  const bFin = bHasta ? Date.parse(bHasta) : Number.POSITIVE_INFINITY;
  return Date.parse(aDesde) < bFin && Date.parse(bDesde) < aFin;
}

// Cuántas máquinas de `salaId` están averiadas durante [inicioISO, finISO).
export function averiasActivasEnRango(
  bloqueos: BloqueoMaquina[],
  salaId: string,
  inicioISO: string,
  finISO: string,
): number {
  return bloqueos.filter(b => b.salaId === salaId && solapan(b.desde, b.hasta, inicioISO, finISO)).length;
}

// Capacidad real (nunca negativa). aforoMaximo es la capacidad nominal; nAverias
// las máquinas fuera de servicio durante la sesión.
export function aforoEfectivo(aforoMaximo: number, nAverias: number): number {
  return Math.max(0, aforoMaximo - nAverias);
}

// Atajo: aforo efectivo de una sesión dado el conjunto de averías del estudio.
export function aforoEfectivoSesion(
  aforoMaximo: number,
  salaId: string,
  inicioISO: string,
  finISO: string,
  bloqueos: BloqueoMaquina[],
): number {
  return aforoEfectivo(aforoMaximo, averiasActivasEnRango(bloqueos, salaId, inicioISO, finISO));
}
