// ─────────────────────────────────────────────────────────────────────────────
// La clase suelta del mostrador es la tarifa PUNTUAL de una sesión que gasta la
// reserva — la MISMA cosa que compra la alumna en la app (`entregarPlanComprado`
// → `reservar_plaza` con su bono). Así se le aplica sola la política de
// cancelación que ya existe para los bonos (`cancelar_reserva_plaza`):
//  · cancela a tiempo → la sesión vuelve a su clase suelta y le sirve para otra;
//  · cancela tarde o no viene → la pierde (salvo «devolver en tardía»);
//  · el estudio cancela la clase → vuelve, si el estudio lo tiene así.
// Nunca se devuelve dinero solo (decisión del fundador, 2-oct-2026).
//
// Antes (#2467) era un recibo suelto `rec-suelta-<reserva>` sin suscripción:
// ligado a la plaza, pero ninguna regla de cancelación lo veía.
//
// Lo comparten la pantalla (qué precio enseña y si se puede cobrar) y el
// servidor (qué cobra): una sola regla. Sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanTarifa } from '../types.ts';
import { planCubreTipoClase } from '../bono-logic.ts';
import { idReciboDeClaseSuelta, PREFIJO_RECIBO_DE_CLASE_SUELTA } from '../cobros/recibo-de-cita.ts';
import { importeAdeudado, importeIngresado, type ReciboParaCifras } from '../billing/situacion-recibo.ts';
import { formatEuro, TZ_ESTUDIO } from '../utils.ts';

export const PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA = 'sus-suelta-';

/**
 * La clase suelta de esta reserva: `sus-suelta-<reserva>`, gemela del recibo
 * `rec-suelta-<reserva>`. Un reintento de la misma reserva la encuentra en vez
 * de crear otra. `null` si el id de la reserva no da un id válido (mismo largo
 * y alfabeto que el del recibo).
 */
export function idSuscripcionDeClaseSuelta(reservaId: string): string | null {
  return idReciboDeClaseSuelta(reservaId) ? `${PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA}${reservaId}` : null;
}

/**
 * El recibo de una clase suelta a partir de su suscripción, y al revés: los dos
 * llevan el id de la reserva para la que se vendió. Hace falta cuando la clase
 * suelta se gasta en OTRA reserva (la recuperó al cancelar a tiempo): su recibo
 * sigue siendo el de la primera. `null` si el id no es de una clase suelta.
 */
export function idReciboDeSuscripcionDeClaseSuelta(suscripcionId: string | null | undefined): string | null {
  if (!suscripcionId?.startsWith(PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA)) return null;
  return idReciboDeClaseSuelta(suscripcionId.slice(PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA.length));
}

export function idSuscripcionDeReciboDeClaseSuelta(reciboId: string | null | undefined): string | null {
  if (!reciboId?.startsWith(PREFIJO_RECIBO_DE_CLASE_SUELTA)) return null;
  return idSuscripcionDeClaseSuelta(reciboId.slice(PREFIJO_RECIBO_DE_CLASE_SUELTA.length));
}

/**
 * La tarifa que hace de clase suelta para ESTA clase: PUNTUAL, activa, de una
 * sesión, con precio, que no sea la oferta de prueba y que cubra el tipo de la
 * clase. Si hay varias, la más barata (entre dos precios verdaderos, cobrar de
 * más es peor), con desempate por id para que pantalla y servidor elijan la
 * misma. `null`: desde el mostrador no se puede vender una clase suelta para
 * esta clase.
 */
export function planDeClaseSuelta(planes: readonly PlanTarifa[], tipoClaseId: string | null): PlanTarifa | null {
  let elegido: PlanTarifa | null = null;
  for (const p of planes) {
    if (p.tipo !== 'PUNTUAL' || p.activo === false || p.esPrueba === true) continue;
    // Exactamente una sesión: con `sesiones` vacío la suscripción nacería sin
    // saldo, la reserva no la gastaría y se cobraría la clase dos veces.
    if (!(Number(p.precio) > 0) || p.sesiones !== 1) continue;
    if (!planCubreTipoClase(p, tipoClaseId)) continue;
    if (!elegido || Number(p.precio) < Number(elegido.precio)
      || (Number(p.precio) === Number(elegido.precio) && p.id < elegido.id)) elegido = p;
  }
  return elegido;
}

/**
 * Lo que se cobra: el precio propio de la sesión si lo tiene (un taller, una
 * clase especial) y, si no, el de la tarifa. `null` si no hay tarifa que la
 * cubra o si el precio de la sesión es 0 (una clase gratuita no se cobra).
 */
export function importeDeClaseSuelta(precioPuntualSesion: number | null | undefined, plan: PlanTarifa | null): number | null {
  if (!plan) return null;
  const precio = typeof precioPuntualSesion === 'number' && Number.isFinite(precioPuntualSesion)
    ? precioPuntualSesion : Number(plan.precio);
  return precio > 0 ? Math.round(precio * 100) / 100 : null;
}

/**
 * Por qué no se puede cobrar la clase suelta de esta clase desde el mostrador,
 * dicho con lo que hay que hacer. `aPaquetes`: se arregla en Paquetes (la
 * pantalla añade el enlace). Tres estudios tienen la tarifa «Clase suelta» de
 * borrador (desactivada y a 0 €): a ellos se les dice que la terminen, no que
 * creen otra.
 */
export function motivoSinClaseSuelta(
  planes: readonly PlanTarifa[], tipoClaseId: string | null, precioPuntualSesion: number | null | undefined,
): { texto: string; aPaquetes: boolean } {
  if (precioPuntualSesion === 0) return { texto: 'Esta clase es gratuita: apúntala como cortesía.', aPaquetes: false };
  const aMedias = planes.find(p => p.tipo === 'PUNTUAL' && p.esPrueba !== true && p.sesiones === 1
    && planCubreTipoClase(p, tipoClaseId) && (p.activo === false || !(Number(p.precio) > 0)));
  if (aMedias) {
    const sinPrecio = !(Number(aMedias.precio) > 0);
    const apagada = aMedias.activo === false;
    const falta = sinPrecio && apagada ? 'no tiene precio y está desactivada: ponle precio y actívala'
      : sinPrecio ? 'no tiene precio: pónselo' : 'está desactivada: actívala';
    return { texto: `Tu tarifa «${aMedias.nombre}» ${falta}`, aPaquetes: true };
  }
  return planDeClaseSuelta(planes, null)
    ? { texto: 'Tu tarifa de clase suelta no vale para este tipo de clase: añádeselo', aPaquetes: true }
    : { texto: 'Para cobrarle la clase suelta desde aquí, crea tu tarifa «Clase suelta» (una sesión)', aPaquetes: true };
}

const FORMATO_DIA = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ_ESTUDIO });
const FORMATO_HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ_ESTUDIO });

/** «Clase suelta — Reformer, jue 2 oct 09:00»: el concepto del recibo, en hora del estudio. */
export function conceptoDeClaseSuelta(tipoClase: string | null | undefined, inicioISO: string): string {
  const d = new Date(inicioISO);
  const dia = FORMATO_DIA.format(d).replace(/\./g, '').replace(/,/g, '');
  return `Clase suelta — ${tipoClase?.trim() || 'clase'}, ${dia} ${FORMATO_HORA.format(d)}`;
}

/**
 * Qué pasó con la clase suelta después de reservar:
 *  · `vendida`: ocupa plaza y la reserva gastó ESTA clase suelta;
 *  · `otro-bono`: ocupa plaza pero gastó otro bono (tenía uno sin que el
 *    mostrador lo supiera): la venta sobra;
 *  · `sin-gastar`: ocupa plaza y no gastó nada (no debería pasar: la venta sobra
 *    y queda una clase sin cobrar que hay que mirar);
 *  · `sin-decidir`: ocupa plaza y el cobro de bono aún no está decidido (un
 *    reintento a medias): se completa antes de decidir nada;
 *  · `no-ocupa`: lista de espera, pendiente de aprobación o cancelada: la venta
 *    sobra (ni dinero sin plaza ni saldo que nadie pidió).
 */
export type DesenlaceVentaSuelta = 'vendida' | 'otro-bono' | 'sin-gastar' | 'sin-decidir' | 'no-ocupa';

/**
 * Lo que dejó el intento de deshacer una venta que sobraba
 * (`anularVentaClaseSuelta`):
 *  · `anulada`: no queda nada (o ya no quedaba);
 *  · `servida`: su sesión ya se había gastado, así que esa venta sí sirvió y su
 *    recibo se queda;
 *  · `fallo`: la clase suelta se canceló pero su recibo no se ha podido anular:
 *    queda un recibo pendiente que sobra;
 *  · `sin-deshacer`: no se ha podido cancelar o comprobar la clase suelta, o su
 *    recibo ya no está pendiente (alguien lo cobró entretanto): hay que mirar su
 *    ficha antes de cobrar o de borrar nada. Borrar solo el recibo dejaría una
 *    clase gratis.
 */
export type DesenlaceAnulacion = 'anulada' | 'servida' | 'fallo' | 'sin-deshacer';

/**
 * Lo que se le dice al mostrador cuando la clase suelta NO ha quedado vendida
 * como se pidió, o `null` si no hay nada que añadir (vendida; o la venta sobraba
 * y se deshizo limpia: ya lo dicen la lista de espera o «ya cubría»).
 * `desconocido`: no se ha podido leer cómo quedó la reserva; entonces no se
 * deshace nada y nunca se manda a «Nuevo cobro» (serían dos recibos).
 */
export function avisoDeVentaSuelta(
  desenlace: DesenlaceVentaSuelta | 'desconocido', anulacion: DesenlaceAnulacion | null,
): string | null {
  if (desenlace === 'vendida') return null;
  if (desenlace === 'desconocido' || desenlace === 'sin-decidir') {
    return 'no se ha podido comprobar si ha entrado con su clase suelta: mira su ficha y «Quién me debe» antes de cobrarle.';
  }
  if (desenlace === 'sin-gastar') {
    return anulacion === 'anulada'
      ? 'no se ha podido apuntar su clase suelta. Cóbrasela desde Cobros con «Nuevo cobro».'
      : 'su clase suelta no ha quedado bien apuntada: mira su ficha y «Quién me debe» antes de cobrarle.';
  }
  if (anulacion === 'anulada') return null;
  return anulacion === 'fallo'
    ? 'revisa «Quién me debe»: puede haber quedado un recibo de su clase suelta que sobra.'
    : 'su clase suelta no se ha podido deshacer: mira su ficha y «Quién me debe» antes de cobrarle o de borrar nada.';
}

export function desenlaceVentaSuelta(p: {
  estado: string;
  /** ¿Está ya decidido el cobro de bono de la reserva? (`bono_decidido_en`) */
  bonoDecidido: boolean;
  /** De qué suscripción salió la sesión (`bono_suscripcion_id`), o `null`. */
  bonoSuscripcionId: string | null;
  /** La clase suelta que se vendió para esta reserva. */
  suscripcionSuelta: string;
}): DesenlaceVentaSuelta {
  if (p.estado !== 'CONFIRMADA' && p.estado !== 'ASISTIDA') return 'no-ocupa';
  if (!p.bonoDecidido) return 'sin-decidir';
  if (p.bonoSuscripcionId === p.suscripcionSuelta) return 'vendida';
  return p.bonoSuscripcionId ? 'otro-bono' : 'sin-gastar';
}

/**
 * Lo que se le dice al estudio al QUITAR de la clase a quien la tenía como
 * clase suelta. Quitar aplica la política de cancelación como si cancelara
 * ella (decidido en el servidor: `bonoDevuelto`, `tardia`), y nunca devuelve
 * dinero solo: el texto dice qué ha pasado con la clase y con el dinero.
 *
 * Los recibos sueltos de antes (#2467, sin suscripción) no tienen política:
 * se avisa de lo pagado o lo pendiente, como entonces.
 */
export function avisoClaseSueltaAlQuitar(p: {
  recibo: (ReciboParaCifras & { suscripcionId?: string | null }) | null | undefined;
  reservaId: string;
  bonoDevuelto: boolean;
  tardia: boolean;
}): string | null {
  const { recibo } = p;
  if (!recibo) return null;
  const pagado = importeIngresado(recibo);
  const debe = importeAdeudado(recibo);
  const conPolitica = !!recibo.suscripcionId && recibo.suscripcionId === idSuscripcionDeClaseSuelta(p.reservaId);
  if (!conPolitica) {
    if (pagado > 0) return `Pagó ${formatEuro(pagado)} por esta clase: si se lo devuelves, márcalo en Cobros`;
    return debe > 0 ? `Tenía ${formatEuro(debe)} pendientes por esta clase: si ya no se los cobras, elimina el recibo en Cobros` : null;
  }
  if (p.bonoDevuelto) {
    if (debe > 0) return `Recupera su clase suelta para otro día, y sigue debiendo ${formatEuro(debe)}`;
    return pagado > 0
      ? 'Recupera su clase suelta para otro día. Si prefieres devolverle el dinero, márcalo en Cobros y quítale la clase suelta en su ficha'
      : 'Recupera su clase suelta para otro día';
  }
  if (p.tardia) {
    return debe > 0 ? `Fuera de plazo: pierde la clase suelta, y sigue debiendo ${formatEuro(debe)}` : 'Fuera de plazo: pierde la clase suelta';
  }
  return null;
}
