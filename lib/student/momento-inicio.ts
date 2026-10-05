import type { Clase, HuellaSocia, Reserva } from './tipos.ts';
import { addDias, horaFin } from './formato.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Inicio según el momento (maquetas aprobadas por el fundador, oct-2026).
//
// Dos preguntas, puras, para que la pantalla solo pinte:
//
//   1. ¿Tiene una clase HOY o MAÑANA? Entonces esa clase va lo primero, bajo una
//      portada más baja. Sin clase en esos dos días, Inicio queda como estaba.
//   2. «¿Qué tal la clase?» NO se decide aquí: la clase a la que acaba de ir
//      ya no viene en el catálogo de la app (solo trae clases sin terminar), así
//      que la elige el servidor (lib/valoraciones/pendiente.ts). De aquí solo
//      sale `haceCuanto`, para su sello.
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
 * «HOY · EN 2 H 10 MIN», «HOY · EN 25 MIN», «TU CLASE, EN CURSO · HASTA LAS 19:20» o
 * «MAÑANA». Lo que falta se redondea HACIA ARRIBA al minuto: decir «en 0 min»
 * a 40 segundos de empezar sería mentir por defecto.
 */
export function etiquetaMomento(m: Pick<ClaseDelMomento, 'clase' | 'cuando'>, ahoraMs: number | null): string {
  if (m.cuando === 'manana') return 'Mañana';
  // Las mismas palabras que el resto de la app para una clase que se está dando
  // (NextClassCard, Mis clases): «Tu clase, en curso».
  if (m.cuando === 'ahora') return `Tu clase, en curso · hasta las ${horaFin(m.clase.hora, m.clase.duracionMin)}`;
  if (ahoraMs === null) return 'Hoy';
  const faltan = Math.max(1, Math.ceil((new Date(m.clase.inicio).getTime() - ahoraMs) / MIN));
  const h = Math.floor(faltan / 60);
  const min = faltan % 60;
  if (h === 0) return `Hoy · en ${min} min`;
  return min === 0 ? `Hoy · en ${h} h` : `Hoy · en ${h} h ${min} min`;
}

/** «Hace 20 min», «Hace 3 h». Para el sello de «¿Qué tal la clase?». */
export function haceCuanto(finIso: string, ahoraMs: number): string {
  const m = Math.max(1, Math.round((ahoraMs - new Date(finIso).getTime()) / MIN));
  if (m < 60) return `Hace ${m} min`;
  return `Hace ${Math.round(m / 60)} h`;
}

// ── La recién llegada (P03, 5-oct-2026) ──────────────────────────────────────

/** Cuántos días de alta como mucho para darle la bienvenida: a las importadas con su fecha real no les llega. */
export const DIAS_RECIEN_LLEGADA = 60;

/**
 * ¿Es una recién llegada? Solo si no ha pasado NADA con ella —ni una reserva, ni un bono o cuota, ni una clase fija, ni
 * una recuperación, ni una cita— y su alta tiene 60 días o menos (o no consta).
 *
 * `null` (no se sabe: sin ficha, o el payload llegó incompleto porque falló una lectura) es «no»: con la duda no se le
 * dice «Bienvenida» a quien lleva años. La vista previa del panel se decide aparte, en la página.
 */
export function esRecienLlegada(huella: HuellaSocia | null, hoy: string): boolean {
  if (!huella) return false;
  if (huella.reservasNoCanceladas + huella.suscripciones + huella.plazasFijas + huella.recuperaciones + huella.citas > 0) return false;
  if (!huella.fechaAlta) return true;
  return huella.fechaAlta.slice(0, 10) >= addDias(hoy, -DIAS_RECIEN_LLEGADA);
}

/**
 * Cuántas clases con plaza hay en los próximos 7 días (hoy incluido): ni empezadas, ni ya suyas, ni llenas, ni sin abrir
 * todavía, ni cerradas por la antelación mínima. Es orientativo, como «Huecos de hoy»: el aforo real lo decide el
 * servidor. Sin reloj (`ahoraMs` null) no se descarta nada por la hora.
 *
 * `soloConBono`: TODAS las contadas necesitan un bono o cuota (`sinPrecioSuelto`) — es lo único que la app sabe de lo
 * que no se puede reservar sin comprar.
 */
export function clasesConPlazaProximas(
  clases: Pick<Clase, 'id' | 'fecha' | 'inicio' | 'fin' | 'plazasLibres' | 'seAbreEl' | 'cierraEl' | 'sinPrecioSuelto'>[],
  reservas: Pick<Reserva, 'claseId' | 'estado'>[],
  hoy: string,
  ahoraMs: number | null,
): { total: number; soloConBono: boolean } {
  const hasta = addDias(hoy, 6);
  const suyas = new Set(reservas.filter((r) => r.estado === 'confirmada' || r.estado === 'en-espera').map((r) => r.claseId));
  const validas = clases.filter((c) => {
    if (c.fecha < hoy || c.fecha > hasta) return false;
    if (suyas.has(c.id) || c.plazasLibres <= 0) return false;
    if (ahoraMs === null) return true;
    if (Date.parse(c.inicio) <= ahoraMs) return false;
    if (c.seAbreEl && ahoraMs < Date.parse(c.seAbreEl)) return false;
    if (c.cierraEl && ahoraMs >= Date.parse(c.cierraEl)) return false;
    return true;
  });
  return { total: validas.length, soloConBono: validas.length > 0 && validas.every((c) => c.sinPrecioSuelto === true) };
}

/**
 * ¿Tiene «Tu ritmo» algo que contar? Una clase a la que ya vino, o un bono o cuota activos. Sin nada de eso la tarjeta
 * eran ceros («0 clases», «Sin bono activo»): P03 la esconde hasta la primera clase asistida.
 */
export function tuRitmoTieneAlgoQueContar(reservas: Pick<Reserva, 'estado'>[], bonoActivo: unknown): boolean {
  return Boolean(bonoActivo) || reservas.some((r) => r.estado === 'asistida');
}
