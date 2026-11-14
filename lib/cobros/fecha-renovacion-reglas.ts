// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar la fecha de renovación» de una cuota MENSUAL (ficha de la clienta).
//
// Por qué existe: la fecha en que una cuota se renueva era la del alta más un mes y no había forma de moverla. Un estudio que cobra a mano
// y quiere que TODAS se renueven el día 1 (o que cobró «hasta el 30» un primer mes parcial) se encontraba con cuotas que acaban el 9 o el
// 13 y ningún sitio donde corregirlo; los ajustes de «cobrar el día 1» solo actúan en la PRÓXIMA renovación y dejan hasta un mes de
// desfase (lib/bono-logic.ts, `proximoFinAlineadoDia1`).
//
// `fecha_fin` es el ÚLTIMO día cubierto: el recibo de renovación lo crea el cron cuando `fecha_fin < hoy`, o sea, el día siguiente. Para
// que renueve el día 1 de diciembre, la fecha es el 30 de noviembre.
//
// Reglas, todas deliberadas:
//  · Una fecha YA pasada no se acepta: crearía el recibo de renovación esa misma noche, sin que nadie lo haya decidido.
//  · Con un máximo (400 días): un año de más es un error de tecleo, no una decisión.
//  · Una cuota que cobra Stripe (`stripe_subscription_id`) no se mueve aquí: su ciclo lo marca Stripe y cambiar la fecha solo la
//    desincronizaría. El panel no ofrece el botón y la función de contexto lo rechaza.
//
// Puro y sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';

export const MAX_DIAS_RENOVACION = 400;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaReal(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export type ResultadoFecha = { ok: true; fecha: string } | { ok: false; error: string };

/** La nueva fecha de fin del ciclo. `hoy` es «hoy en el estudio» (`hoyEnEstudio`), nunca la del navegador ni la de UTC. */
export function validarFechaRenovacion(nueva: unknown, hoy: string): ResultadoFecha {
  if (typeof nueva !== 'string' || !esFechaReal(nueva)) return { ok: false, error: 'Elige una fecha válida.' };
  if (nueva < hoy) return { ok: false, error: 'La fecha no puede ser anterior a hoy: se crearía el cobro de renovación esta misma noche.' };
  if (nueva > masDias(hoy, MAX_DIAS_RENOVACION)) return { ok: false, error: 'Esa fecha queda demasiado lejos. Revisa el año.' };
  return { ok: true, fecha: nueva };
}

/** Los atajos que se ofrecen: el último día de este mes y el del siguiente, si aún no han pasado. */
export function atajosDeRenovacion(hoy: string): { etiqueta: string; fecha: string }[] {
  const [y, m] = hoy.split('-').map(Number);
  const ultimo = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10); // mes 1-12 → día 0 del siguiente
  const esteMes = ultimo(y, m);
  const siguiente = m === 12 ? ultimo(y + 1, 1) : ultimo(y, m + 1);
  const lista = [
    { etiqueta: 'Fin de este mes', fecha: esteMes },
    { etiqueta: 'Fin del mes que viene', fecha: siguiente },
  ];
  return lista.filter(a => a.fecha >= hoy);
}

/** ¿Se puede mover la fecha de ESTA cuota desde el panel? */
export function puedeCambiarFechaRenovacion(s: { estado: string; fechaFin: string | null; stripeSubscriptionId: string | null }, tipoPlan: string | undefined):
  { ok: true } | { ok: false; motivo: string } {
  if (tipoPlan !== 'MENSUAL') return { ok: false, motivo: 'Solo las cuotas mensuales tienen fecha de renovación.' };
  if (s.estado !== 'ACTIVA') return { ok: false, motivo: 'Solo se puede cambiar la fecha de una cuota activa.' };
  if (!s.fechaFin) return { ok: false, motivo: 'Esta cuota no tiene fecha de renovación.' };
  if (s.stripeSubscriptionId) return { ok: false, motivo: 'Esta cuota se cobra con Stripe: su fecha la marca Stripe y no se puede mover desde aquí.' };
  return { ok: true };
}
