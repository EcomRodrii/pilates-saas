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

import type { PlanTarifa, Suscripcion } from '../types.ts';
import { planCubreTipoClase } from '../bono-logic.ts';
import { idReciboDeClaseSuelta, PREFIJO_RECIBO_DE_CLASE_SUELTA } from '../cobros/recibo-de-cita.ts';
import { importeAdeudado, importeIngresado, situacionRecibo, type ReciboParaCifras } from '../billing/situacion-recibo.ts';
import { formatEuro, hoyEnEstudio, TZ_ESTUDIO } from '../utils.ts';

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
 * Las cuotas que se le pueden dar desde el mostrador a quien viene sin nada que
 * cubra ESTA clase: mensuales activas, que no sean de prueba y que incluyan el
 * tipo de clase. Antes la hoja solo sabía vender la clase suelta, y una alumna
 * que venía a apuntarse con su cuota de «2 días a la semana» salía de ahí con
 * una clase suelta de 23 € que luego, al darle la cuota en su ficha, se pagaba
 * dos veces. Las más baratas primero; a igual precio, por nombre.
 */
export function cuotasQueCubren(planes: readonly PlanTarifa[], tipoClaseId: string | null): PlanTarifa[] {
  return planes
    .filter(p => p.tipo === 'MENSUAL' && p.activo !== false && p.esPrueba !== true && planCubreTipoClase(p, tipoClaseId))
    .sort((a, b) => Number(a.precio) - Number(b.precio) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Por qué una alumna que YA tiene cuota no entra con ella en esta clase. */
export type MotivoCuotaQueNoCubre = 'VENCIDA' | 'PAUSADA' | 'NO_INCLUYE_LA_CLASE' | 'OTRO';

/**
 * La cuota que ya tiene (ACTIVA o PAUSADA, vigente o no), si tiene alguna. Si la
 * tiene, desde el mostrador NO se le da otra: darle una cuota nueva cancela la
 * suya (`assignPlan`) y cobra el mes entero otra vez. Pasaba con las tres formas
 * de «tiene cuota pero el calendario no la cuenta»:
 *  · VENCIDA a falta de cobrar su renovación: el recibo de renovación sigue vivo
 *    y, con la cuota cancelada, cobrarlo ya no le da el mes → pagaba dos veces.
 *  · PAUSADA: quedaban una pausada y una activa; al reanudar, dos cuotas.
 *  · NO_INCLUYE_LA_CLASE: se la cambiaba a mitad de ciclo sin decirlo.
 * Lo que toca en cada caso (cobrar la renovación, reanudarla, cambiarla) se hace
 * en su ficha o en Cobros, donde se ve qué se sustituye.
 */
export function cuotaQueYaTiene(
  socioId: string,
  suscripciones: readonly Suscripcion[],
  planes: readonly PlanTarifa[],
  hoyISO: string,
  tipoClaseId: string | null,
): { nombre: string; motivo: MotivoCuotaQueNoCubre } | null {
  let elegida: { nombre: string; motivo: MotivoCuotaQueNoCubre } | null = null;
  for (const s of suscripciones) {
    if (s.socioId !== socioId || (s.estado !== 'ACTIVA' && s.estado !== 'PAUSADA')) continue;
    const plan = planes.find(p => p.id === s.planId);
    if (!plan || plan.tipo !== 'MENSUAL') continue;
    const motivo: MotivoCuotaQueNoCubre = s.estado === 'PAUSADA' ? 'PAUSADA'
      : s.fechaFin && s.fechaFin < hoyISO ? 'VENCIDA'
      : !planCubreTipoClase(plan, tipoClaseId) ? 'NO_INCLUYE_LA_CLASE'
      : 'OTRO';
    // Si tiene varias, la que más pide atención: la vencida (hay un cobro esperando).
    if (!elegida || motivo === 'VENCIDA') elegida = { nombre: plan.nombre, motivo };
  }
  return elegida;
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
  // Anulada porque la cubría su cuota: ni recupera nada ni debe nada (la devolución de la
  // sesión cae en una clase suelta ya cancelada, que no se puede usar).
  if (situacionRecibo(recibo) === 'ANULADO') return null;
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

// ─────────────────────────────────────────────────────────────────────────────
// La clase suelta de una clase que YA cubre su cuota.
//
// Se le vende una clase suelta para el lunes y el miércoles se pasa a cuota: el
// lunes queda pagado dos veces (la clase suelta y la cuota, que empieza hoy y lo
// incluye). Un estudio lo vivió así y tuvo que ir borrando cargos a mano. La
// ficha lo dice en cuanto pasa, venga la cuota de donde venga, y ofrece anular la
// clase suelta si aún no se ha cobrado; si ya la pagó, solo lo cuenta: devolver
// el dinero es decisión del estudio.
//
// ⚠️ «La cubre» quiere decir que la cuota la pagaría de verdad: el día y el tipo,
// y que quepa en su tope semanal (y en el de ese tipo de clase), contado como lo
// cuenta la base de datos (`calcular_excede_limite_semanal`: todas sus reservas
// vivas de la semana de Madrid, de lunes a domingo, las pague quien las pague).
// Sin el tope, la 3.ª clase de una semana con cuota de 2 días salía «cubierta» y
// anularla regalaba una clase.
// ─────────────────────────────────────────────────────────────────────────────

/** Estados de una reserva que sí ocupan (o han ocupado) la clase: la que se canceló no se cobra dos veces. */
const RESERVA_VIVA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

/** El lunes (YYYY-MM-DD) de la semana de Madrid de un instante, como `date_trunc('week', … at time zone 'Europe/Madrid')`. */
export function semanaEnEstudio(inicioISO: string): string {
  const [a, m, d] = hoyEnEstudio(new Date(inicioISO)).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  const desdeLunes = (dia.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(a, m - 1, d - desdeLunes)).toISOString().slice(0, 10);
}

/** Una reserva de la alumna, con lo que hace falta para contar su tope semanal. */
export interface ReservaParaTope {
  estado: string;
  inicio: string;
  tipoClaseId: string | null;
  cancelada?: boolean;
}

/** ¿Esta clase cabe en el tope semanal de la cuota (y en el de su tipo), contando todas sus reservas vivas de esa semana? */
export function cabeEnElTopeSemanal(
  plan: Pick<PlanTarifa, 'limiteSemanal' | 'limitePorTipo' | 'tiposClaseIds'>,
  tipoClaseId: string | null,
  inicioClase: string,
  reservas: readonly ReservaParaTope[],
): boolean {
  const semana = semanaEnEstudio(inicioClase);
  const deLaSemana = reservas.filter(r => RESERVA_VIVA.has(r.estado) && !r.cancelada && semanaEnEstudio(r.inicio) === semana);
  const tope = plan.limiteSemanal ?? 0;
  if (tope > 0 && deLaSemana.filter(r => planCubreTipoClase(plan, r.tipoClaseId)).length > tope) return false;
  const topeTipo = tipoClaseId ? plan.limitePorTipo?.[tipoClaseId] ?? 0 : 0;
  if (topeTipo > 0 && deLaSemana.filter(r => r.tipoClaseId === tipoClaseId).length > topeTipo) return false;
  return true;
}

/**
 * La cuota (MENSUAL, ACTIVA) que pagaría esta clase: la incluye ese día (hora del
 * estudio) y ese tipo, y cabe en su tope semanal con `reservas` (TODAS las suyas,
 * esta incluida).
 */
export function cuotaQueCubreLaClase(
  socioId: string,
  suscripciones: readonly Suscripcion[],
  planes: readonly PlanTarifa[],
  inicioClase: string,
  tipoClaseId: string | null,
  reservas: readonly ReservaParaTope[],
): PlanTarifa | null {
  const fecha = hoyEnEstudio(new Date(inicioClase));
  for (const s of suscripciones) {
    if (s.socioId !== socioId || s.estado !== 'ACTIVA') continue;
    if (s.fechaInicio.slice(0, 10) > fecha || (s.fechaFin && s.fechaFin.slice(0, 10) < fecha)) continue;
    const plan = planes.find(p => p.id === s.planId);
    if (!plan || plan.tipo !== 'MENSUAL' || !planCubreTipoClase(plan, tipoClaseId)) continue;
    if (cabeEnElTopeSemanal(plan, tipoClaseId, inicioClase, reservas)) return plan;
  }
  return null;
}

export interface SueltaQueCubreLaCuota {
  reciboId: string;
  reservaId: string;
  /** ISO de inicio de la clase. */
  inicio: string;
  /** Lo pendiente o, si ya la pagó, lo pagado (neto de lo devuelto). */
  importe: number;
  pagado: boolean;
  /** El recibo ya está anulado pero falta quitar la clase suelta (un intento que se quedó a medias): «Terminar». */
  aMedias: boolean;
  cuota: string;
}

/** Las clases sueltas de una alumna (pendientes o pagadas) de clases que ya cubre su cuota. */
export function clasesSueltasQueCubreSuCuota(p: {
  socioId: string;
  recibos: readonly (ReciboParaCifras & { id: string; socioId?: string | null; suscripcionId?: string | null })[];
  reservas: readonly { id: string; socioId: string; sesionId: string; estado: string; bonoSuscripcionId?: string | null }[];
  sesion: (id: string) => { inicio: string; tipoClaseId: string | null; cancelada?: boolean } | undefined;
  suscripciones: readonly Suscripcion[];
  planes: readonly PlanTarifa[];
}): SueltaQueCubreLaCuota[] {
  const paraTope: ReservaParaTope[] = [];
  for (const r of p.reservas) {
    if (r.socioId !== p.socioId) continue;
    const ses = p.sesion(r.sesionId);
    if (ses) paraTope.push({ estado: r.estado, inicio: ses.inicio, tipoClaseId: ses.tipoClaseId, cancelada: ses.cancelada });
  }
  const fuera: SueltaQueCubreLaCuota[] = [];
  for (const r of p.recibos) {
    if (r.socioId !== p.socioId || !r.id.startsWith(PREFIJO_RECIBO_DE_CLASE_SUELTA)) continue;
    const reservaId = r.id.slice(PREFIJO_RECIBO_DE_CLASE_SUELTA.length);
    // Solo la venta de ESA reserva: un recibo suelto de antes no lleva su clase suelta.
    if (!r.suscripcionId || r.suscripcionId !== idSuscripcionDeClaseSuelta(reservaId)) continue;
    const reserva = p.reservas.find(x => x.id === reservaId && x.socioId === p.socioId);
    if (!reserva || !RESERVA_VIVA.has(reserva.estado)) continue;
    const ses = p.sesion(reserva.sesionId);
    if (!ses || ses.cancelada) continue;
    const cuota = cuotaQueCubreLaClase(p.socioId, p.suscripciones, p.planes, ses.inicio, ses.tipoClaseId, paraTope);
    if (!cuota) continue;
    const situacion = situacionRecibo(r);
    const aMedias = situacion === 'ANULADO'
      && (p.suscripciones.some(s => s.id === r.suscripcionId && s.estado === 'ACTIVA') || reserva.bonoSuscripcionId === r.suscripcionId);
    const base = { reciboId: r.id, reservaId, inicio: ses.inicio, cuota: cuota.nombre };
    if (situacion === 'POR_COBRAR') fuera.push({ ...base, importe: importeAdeudado(r), pagado: false, aMedias: false });
    else if (aMedias) fuera.push({ ...base, importe: 0, pagado: false, aMedias: true });
    else if (situacion === 'COBRADO') fuera.push({ ...base, importe: importeIngresado(r), pagado: true, aMedias: false });
  }
  return fuera.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export type MotivoParaNoAnularSuelta =
  'NO_ES_CLASE_SUELTA' | 'NO_PENDIENTE' | 'COBRO_EN_MARCHA' | 'TIENE_FACTURA' | 'RESERVA_NO_VALE' | 'SIN_CUOTA_QUE_LA_CUBRA';

/**
 * Lo que comprueba el SERVIDOR antes de anular una clase suelta porque la cubre
 * la cuota, con lo que ha leído él (nunca lo que diga el navegador).
 *
 * Un recibo ya ANULADO vale solo para TERMINAR un intento que se quedó a medias
 * (la clase suelta sigue activa o la reserva sigue colgando de ella): repetirlo
 * no anula nada dos veces.
 */
export function puedeAnularSueltaPorCuota(p: {
  reciboId: string;
  recibo: {
    socio_id: string; suscripcion_id: string | null; estado: string; fecha_cobro: string | null;
    stripe_payment_intent_id: string | null; checkout_session_id: string | null;
    cobro_mostrador_pi: string | null; cobro_off_session_clave: string | null;
  } | null;
  /** La clase suelta (`sus-suelta-…`) tal como está. */
  suelta: { estado: string } | null;
  reserva: { socio_id: string; estado: string; bono_suscripcion_id: string | null } | null;
  sesion: { cancelada: boolean } | null;
  tieneFactura: boolean;
  cuota: PlanTarifa | null;
}): { ok: true; reservaId: string; suscripcionId: string; terminar: boolean } | { ok: false; motivo: MotivoParaNoAnularSuelta; error: string } {
  const reservaId = p.reciboId.startsWith(PREFIJO_RECIBO_DE_CLASE_SUELTA) ? p.reciboId.slice(PREFIJO_RECIBO_DE_CLASE_SUELTA.length) : '';
  const suscripcionId = reservaId ? idSuscripcionDeClaseSuelta(reservaId) : null;
  if (!p.recibo || !suscripcionId || p.recibo.suscripcion_id !== suscripcionId) {
    return { ok: false, motivo: 'NO_ES_CLASE_SUELTA', error: 'Ese recibo no es la clase suelta de una reserva.' };
  }
  const aMedias = p.recibo.estado === 'ANULADO'
    && (p.suelta?.estado === 'ACTIVA' || p.reserva?.bono_suscripcion_id === suscripcionId);
  if (!aMedias && (p.recibo.estado !== 'PENDIENTE' || p.recibo.fecha_cobro)) {
    return { ok: false, motivo: 'NO_PENDIENTE', error: 'Esa clase suelta ya no está pendiente: si la pagó, devolver el dinero se marca en Cobros.' };
  }
  if (p.recibo.stripe_payment_intent_id || p.recibo.checkout_session_id || p.recibo.cobro_mostrador_pi || p.recibo.cobro_off_session_clave) {
    return { ok: false, motivo: 'COBRO_EN_MARCHA', error: 'Esa clase suelta tiene un cobro en marcha: espera a que termine y revísala en Cobros.' };
  }
  if (p.tieneFactura) {
    return { ok: false, motivo: 'TIENE_FACTURA', error: 'Esa clase suelta ya tiene factura: anularla es una rectificativa, desde Cobros.' };
  }
  if (!p.reserva || p.reserva.socio_id !== p.recibo.socio_id || !RESERVA_VIVA.has(p.reserva.estado) || !p.sesion || p.sesion.cancelada) {
    return { ok: false, motivo: 'RESERVA_NO_VALE', error: 'La reserva de esa clase suelta ya no está en pie: revísala en Cobros.' };
  }
  if (!p.cuota) {
    return { ok: false, motivo: 'SIN_CUOTA_QUE_LA_CUBRA', error: 'Su cuota no cubre esa clase (otro día, otro tipo o se pasa de sus clases de esa semana): la clase suelta sigue siendo lo que la paga.' };
  }
  return { ok: true, reservaId, suscripcionId, terminar: aMedias };
}
