// ─────────────────────────────────────────────────────────────────────────────
// «El 8 de diciembre (Inmaculada) tienes 6 clases y 41 reservas. ¿Cierras ese
// día?» — qué festivos esperan una decisión del estudio y cómo se dicen. Puro.
//
// Un festivo espera decisión si cae entre MAÑANA y 21 días después, tiene al
// menos una clase y nadie lo ha decidido: ni hay un cierre ese día ni se dijo
// «Abrimos igualmente». Hoy queda fuera a propósito: cerrar el día en curso
// cancelaría también las clases que ya se han dado y les devolvería el bono.
//
// Nada de esto cancela nada: solo cuenta. Decide la propietaria.
// ─────────────────────────────────────────────────────────────────────────────

import { aniosConFestivos, festivoDe, festivosEntre, type FestivoOficial, type ZonaFestivos } from './oficiales.ts';

export const DIAS_AVISO_FESTIVO = 21;

export type { FestivoConClases } from './textos.ts';
export { fechaDelFestivo, fraseFestivo, motivoDelCierre } from './textos.ts';

/** Días civiles YYYY-MM-DD; sin horas, así que el cambio de hora no cuenta. */
export function sumarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * La ventana del aviso, o la de «Ver todos» (hasta el último año con algo:
 * el último cargado de esa zona o el del último festivo guardado por el estudio
 * en el módulo Festivos). `hoy` es el día del estudio (`hoyEnEstudio`), nunca el de UTC.
 */
export function ventanaFestivos(
  hoy: string,
  alcance: 'aviso' | 'todos',
  zona: ZonaFestivos | null,
  ultimoGuardado: string | null = null,
): { desde: string; hasta: string } | null {
  const desde = sumarDias(hoy, 1);
  if (alcance === 'aviso') return { desde, hasta: sumarDias(hoy, DIAS_AVISO_FESTIVO) };
  const ultimo = Math.max(...(zona ? aniosConFestivos(zona) : []), ultimoGuardado ? Number(ultimoGuardado.slice(0, 4)) : 0, 0);
  if (!ultimo) return null;
  const hasta = `${ultimo}-12-31`;
  return hasta >= desde ? { desde, hasta } : null;
}

/** Un festivo que el estudio ha guardado en el módulo Festivos (no está en el boletín). */
export type FestivoGuardado = FestivoOficial;

/**
 * Los festivos de la ventana que nadie ha decidido todavía: los oficiales de la
 * zona y los que el estudio ha guardado (sin repetir un día: manda el oficial).
 */
export function festivosSinDecidir(
  zona: ZonaFestivos | null,
  ventana: { desde: string; hasta: string },
  decidido: { abiertos: ReadonlySet<string>; cierres: ReadonlyArray<{ desde: string; hasta: string }> },
  guardados: readonly FestivoGuardado[] = [],
): FestivoOficial[] {
  const oficiales = zona ? festivosEntre(zona, ventana.desde, ventana.hasta) : [];
  const deOficiales = new Set(oficiales.map((f) => f.fecha));
  const propios = guardados.filter((g) => g.fecha >= ventana.desde && g.fecha <= ventana.hasta && !deOficiales.has(g.fecha));
  return [...oficiales, ...propios.map((g) => ({ fecha: g.fecha, nombre: g.nombre }))]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .filter((f) => !decidido.abiertos.has(f.fecha) && !decidido.cierres.some((c) => c.desde <= f.fecha && f.fecha <= c.hasta));
}

/**
 * Para «Abrimos igualmente»: la fecha tiene que ser un festivo de la zona del
 * estudio (la recalcula el servidor, nunca la que diga el cliente) o uno que el
 * estudio haya guardado (lo lee el servidor de su tabla), y posterior a hoy. El
 * nombre que se guarda sale de aquí, no del cliente.
 */
export function festivoAbrible(
  zona: ZonaFestivos | null, fecha: string, hoy: string, guardados: readonly FestivoGuardado[] = [],
): FestivoOficial | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha <= hoy) return null;
  const oficial = zona ? festivoDe(zona, fecha) : null;
  if (oficial) return oficial;
  const propio = guardados.find((g) => g.fecha === fecha);
  return propio ? { fecha: propio.fecha, nombre: propio.nombre } : null;
}
