import type { Clase, Reserva } from './tipos.ts';
import { addDias, horaFin } from './formato.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Inicio según el momento (maquetas aprobadas por el fundador, oct-2026).
//
// Dos preguntas, puras, para que la pantalla solo pinte:
//
//   1. ¿Tiene una clase HOY o MAÑANA? Entonces esa clase va lo primero, bajo una
//      portada más baja. Sin clase en esos dos días, Inicio queda como estaba.
//   2. ¿Acaba de ASISTIR a una clase (menos de 24 h) que aún no ha valorado?
//      Entonces «¿Qué tal la clase?» va arriba.
//
// ⚠️ «Hoy» y «mañana» son días del ESTUDIO (`hoyISO`, Europe/Madrid), igual que
// el resto de la app: `Clase.fecha` ya viene en esa zona.
// ⚠️ `ahoraMs === null` es «todavía no hay reloj» (antes de hidratar, ver
// `useAhoraMs`). Sin reloj no se descarta ninguna clase de hoy por haber
// terminado —se decide en cuanto llega— y no se ofrece valorar nada.
// ─────────────────────────────────────────────────────────────────────────────

export type CuandoClase = 'ahora' | 'hoy' | 'manana';

export interface ClaseDelMomento {
  reserva: Reserva;
  clase: Clase;
  cuando: CuandoClase;
}

const MIN = 60_000;
/** Cuánto dura la oferta de valorar una clase tras terminar. */
export const VENTANA_VALORAR_MS = 24 * 60 * MIN;

function juntar(reservas: Reserva[], clases: Clase[]) {
  const porId = new Map(clases.map((c) => [c.id, c]));
  return reservas
    .map((r) => ({ r, c: porId.get(r.claseId) }))
    .filter((x): x is { r: Reserva; c: Clase } => Boolean(x.c));
}

/**
 * La clase que manda en Inicio: su próxima reserva CONFIRMADA que no ha
 * terminado, si es de hoy o de mañana. La misma que «Tu próxima clase» (mismo
 * orden, mismo filtro), así que nunca enseñan dos clases distintas.
 */
export function claseDelMomento(
  reservas: Reserva[], clases: Clase[], hoy: string, ahoraMs: number | null,
): ClaseDelMomento | null {
  const manana = addDias(hoy, 1);
  const proxima = juntar(reservas, clases)
    .filter((x) => x.r.estado === 'confirmada')
    .filter((x) => x.c.fecha >= hoy)
    .filter((x) => ahoraMs === null || ahoraMs < new Date(x.c.fin).getTime())
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))[0];
  if (!proxima) return null;
  if (proxima.c.fecha !== hoy && proxima.c.fecha !== manana) return null;
  const empezada = ahoraMs !== null && ahoraMs >= new Date(proxima.c.inicio).getTime();
  return {
    reserva: proxima.r,
    clase: proxima.c,
    cuando: empezada ? 'ahora' : proxima.c.fecha === hoy ? 'hoy' : 'manana',
  };
}

/**
 * «HOY · EN 2 H 10 MIN», «HOY · EN 25 MIN», «AHORA · HASTA LAS 19:20» o
 * «MAÑANA». Lo que falta se redondea HACIA ARRIBA al minuto: decir «en 0 min»
 * a 40 segundos de empezar sería mentir por defecto.
 */
export function etiquetaMomento(m: Pick<ClaseDelMomento, 'clase' | 'cuando'>, ahoraMs: number | null): string {
  if (m.cuando === 'manana') return 'Mañana';
  if (m.cuando === 'ahora') return `Ahora · hasta las ${horaFin(m.clase.hora, m.clase.duracionMin)}`;
  if (ahoraMs === null) return 'Hoy';
  const faltan = Math.max(1, Math.ceil((new Date(m.clase.inicio).getTime() - ahoraMs) / MIN));
  const h = Math.floor(faltan / 60);
  const min = faltan % 60;
  if (h === 0) return `Hoy · en ${min} min`;
  return min === 0 ? `Hoy · en ${h} h` : `Hoy · en ${h} h ${min} min`;
}

/**
 * La clase que puede valorar ahora: ASISTIDA (es la regla del servidor,
 * `puedeValorarReserva`) y terminada hace menos de 24 h. Si hay varias, la más
 * reciente. Si ya la valoró lo dice el servidor; esto no lo sabe.
 */
export function claseParaValorar(
  reservas: Reserva[], clases: Clase[], ahoraMs: number | null,
): { reserva: Reserva; clase: Clase } | null {
  if (ahoraMs === null) return null;
  const candidata = juntar(reservas, clases)
    .filter((x) => x.r.estado === 'asistida')
    .filter((x) => {
      const fin = new Date(x.c.fin).getTime();
      return Number.isFinite(fin) && fin <= ahoraMs && ahoraMs - fin < VENTANA_VALORAR_MS;
    })
    .sort((a, b) => b.c.fin.localeCompare(a.c.fin))[0];
  return candidata ? { reserva: candidata.r, clase: candidata.c } : null;
}

/** «Hace 20 min», «Hace 3 h». Para el sello de «¿Qué tal la clase?». */
export function haceCuanto(finIso: string, ahoraMs: number): string {
  const m = Math.max(1, Math.round((ahoraMs - new Date(finIso).getTime()) / MIN));
  if (m < 60) return `Hace ${m} min`;
  return `Hace ${Math.round(m / 60)} h`;
}
