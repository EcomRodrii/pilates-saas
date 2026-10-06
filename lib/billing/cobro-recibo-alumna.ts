// Quién cobra cada recibo que la alumna debe, y si puede pagarlo ella desde su app (Recibos, 6-oct-2026).
//
// «Recibos» de la app pasa a dejar pagar lo pendiente con la hoja de siempre (`HojaPagarRecibo` → `/api/stripe/checkout`
// incrustado). Lo difícil no es pagar: es NO ofrecer pagar con tarjeta lo que ya va a cobrar otro (sería cobrarlo dos
// veces o, como poco, decirle que pague algo de lo que no tiene que ocuparse), y no decirle «no tienes que hacer nada» de
// algo que no va a cobrar nadie. El checkout NO mira ni el reintento programado ni el mandato: esta función es la única
// barrera de esa regla, así que sale de las reglas que ya existían, no de unas nuevas:
//
//   · Qué es deuda: `esReciboCobrable` (lib/billing/deuda-recibo.ts), el mismo criterio del checkout. Un importe de 0 € no
//     se ofrece (el checkout contesta «Importe no válido»).
//   · Un cobro en vuelo (datáfono de la Caja o cargo off-session) no se ofrece: el checkout lo rechaza (409).
//   · La renovación de una cuota EN PAUSA no se paga desde la app (decisión del fundador, 5-oct; checkout 409
//     `cuota-en-pausa`), y el dunning tampoco la cobra (la omite): se mira ANTES que el reintento.
//   · El recibo de una penalización solo se paga con el cobro decidido (`ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA`, la regla del
//     checkout); y la remesa solo mete las de RECIBO_CREADO (`recibosSinPenalizacionesSinAprobar`).
//   · Con reintento programado lo cobra solo el dunning («con reintento programado NO entra»,
//     `esRenovacionSinCobroAutomatico`), con lo que elija `elegirMetodoCobro`, y solo si el estudio cobra online (sin cuenta
//     de Stripe el dunning ni corre). Sin método guardado, el dunning no lo cobrará nunca: lo paga ella.
//   · Una clienta domiciliada (mandato VIGENTE) en un estudio que hace remesas: su recibo PENDIENTE va en la próxima remesa,
//     salvo la renovación que la remesa deja fuera (`renovacionDeCuotaEnEspera`, la misma que usa la remesa): de una cuota
//     cancelada no la cobra nadie (la paga ella); de una que aún no ha vencido, irá cuando venza. La FECHA de una remesa no
//     se sabe (la prepara el estudio a mano): no se promete ninguna.
//
// Lo calcula el SERVIDOR (fetchPublicStudioData), que es el único que ve los métodos guardados, los mandatos, la cuenta de
// Stripe y las penalizaciones; la app solo pinta. Puro y sin `@/`: lo prueba `node --test`.

import { esReciboCobrable } from './deuda-recibo.ts';
import { elegirMetodoCobro, type SocioMetodoPago } from './metodo-cobro.ts';
import { ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA, PREFIJO_RECIBO_PENALIZACION } from './penalizacion-aprobar-reglas.ts';
import { renovacionDeCuotaEnEspera } from './renovacion-adoptable.ts';

export interface FilaReciboAlumna {
  id: string;
  estado: string;
  importe: number | string | null;
  importe_devuelto?: number | string | null;
  reembolso_stripe_id?: string | null;
  reembolso_solicitado_en?: string | null;
  es_renovacion?: boolean | null;
  proximo_reintento?: string | null;
  fecha_vencimiento?: string | null;
  suscripcion_id?: string | null;
  cobro_off_session_clave?: string | null;
  cobro_mostrador_pi?: string | null;
  tras_cancelar_cuota?: string | null;
}

/**
 * - `APP`: lo paga ella desde la app (con la hoja de pago).
 * - `BANCO`: domiciliación. `via: 'sepa'` = el SEPA de Stripe del cobro diario, con `desde` = el día programado;
 *   `via: 'remesa'` = la remesa del estudio, sin fecha (la prepara el estudio); `cuandoVenza` = renovación aún sin vencer.
 * - `TARJETA`: su tarjeta guardada, sola. `desde`: el día del cobro programado.
 * - `EN_MARCHA`: ya se le está cobrando (datáfono o cargo en vuelo).
 * - `ESTUDIO`: no se paga desde la app. `motivo` lo dice.
 */
export type CobroDeReciboAlumna =
  | { como: 'APP' }
  | { como: 'BANCO'; via: 'sepa' | 'remesa'; desde: string | null; cuandoVenza?: boolean }
  | { como: 'TARJETA'; desde: string | null }
  | { como: 'EN_MARCHA' }
  | { como: 'ESTUDIO'; motivo: 'sin-pago-online' | 'cuota-en-pausa' | 'pendiente-estudio' };

/** La cuota de un recibo, para saber si la remesa lo mete (`renovacionDeCuotaEnEspera`). */
export interface CuotaDelReciboAlumna { estado: string | null; fechaFin: string | null; tipoPlan: string | null }

export interface ContextoCobroAlumna {
  /** El estudio tiene Stripe conectado: se puede pagar online (y el cobro diario corre). */
  pagableOnline: boolean;
  /** Sus métodos guardados (`socios.*`): el MISMO dato con el que elige el cobro diario. */
  socio: SocioMetodoPago;
  /** El estudio hace remesas (datos de acreedor SEPA) y ella tiene un mandato VIGENTE. */
  domiciliadaEnRemesa: boolean;
  /** Sus suscripciones, por id: estado, fin y tipo de plan. */
  cuotas: ReadonlyMap<string, CuotaDelReciboAlumna>;
  /** Estado de la penalización de cada recibo `rec-penaliz-*`, por id de recibo. Sin entrada = no se sabe. */
  penalizaciones: ReadonlyMap<string, string>;
  /** Día del estudio, `yyyy-mm-dd`. */
  hoy: string;
}

const dia = (iso: string | null | undefined): string | null => (iso ? iso.slice(0, 10) : null);
const enLaApp = (ctx: ContextoCobroAlumna): CobroDeReciboAlumna =>
  ctx.pagableOnline ? { como: 'APP' } : { como: 'ESTUDIO', motivo: 'sin-pago-online' };

/** Quién cobra este recibo. `null` = no es deuda (cobrado, anulado, reembolsado, 0 €…): no se dice nada. */
export function cobroDeReciboAlumna(r: FilaReciboAlumna, ctx: ContextoCobroAlumna): CobroDeReciboAlumna | null {
  if (!esReciboCobrable({
    estado: r.estado, importe: r.importe ?? 0, importe_devuelto: r.importe_devuelto ?? 0,
    reembolso_stripe_id: r.reembolso_stripe_id ?? null, reembolso_solicitado_en: r.reembolso_solicitado_en ?? null,
  })) return null;
  if (!(Number(r.importe) > 0)) return null;

  // Ya se está cobrando: abrir otro pago sería el segundo cobro (el checkout lo rechaza igual).
  if (r.cobro_off_session_clave || r.cobro_mostrador_pi) return { como: 'EN_MARCHA' };

  // La penalización sin el cobro decidido (sin aprobar, anulada…): ni la app ni la remesa. Sin saber su estado, tampoco.
  const esPenalizacion = r.id.startsWith(PREFIJO_RECIBO_PENALIZACION);
  const penalizacion = esPenalizacion ? ctx.penalizaciones.get(r.id) ?? null : null;
  if (esPenalizacion && !(ESTADOS_QUE_DEJAN_PAGAR_A_LA_ALUMNA as readonly string[]).includes(penalizacion ?? '')) {
    return { como: 'ESTUDIO', motivo: 'pendiente-estudio' };
  }

  const cuota = r.suscripcion_id ? ctx.cuotas.get(r.suscripcion_id) ?? null : null;
  // En pausa: ni el checkout ni el dunning la cobran. ANTES que el reintento: el dunning la omite cada día sin desprogramarla.
  if (r.es_renovacion === true && cuota?.estado === 'PAUSADA') return { como: 'ESTUDIO', motivo: 'cuota-en-pausa' };

  // Con reintento programado lo cobra el dunning, si corre (estudio con Stripe) y tiene con qué.
  if (r.proximo_reintento) {
    if (!ctx.pagableOnline) return { como: 'ESTUDIO', motivo: 'sin-pago-online' };
    const m = elegirMetodoCobro(ctx.socio);
    if (!m.ok) return { como: 'APP' };
    return m.metodo === 'SEPA'
      ? { como: 'BANCO', via: 'sepa', desde: dia(r.proximo_reintento) }
      : { como: 'TARJETA', desde: dia(r.proximo_reintento) };
  }

  // PENDIENTE de una domiciliada: va en la remesa, con las MISMAS exclusiones que la remesa. Un FALLIDO o un DEVUELTO por el
  // banco ya no va solo (el estudio lo reintenta a mano): ese lo puede pagar ella. Una penalización FALLIDA, igual.
  if (r.estado === 'PENDIENTE' && ctx.domiciliadaEnRemesa && penalizacion !== 'FALLIDA') {
    const espera = r.es_renovacion === true && cuota
      ? renovacionDeCuotaEnEspera({
        esRenovacion: true, tipoPlan: cuota.tipoPlan, fechaFin: cuota.fechaFin, estadoCuota: cuota.estado,
        trasCancelarCuota: r.tras_cancelar_cuota ?? null,
      }, ctx.hoy)
      : null;
    if (espera === 'CUOTA_CANCELADA') return enLaApp(ctx); // nadie lo va a cobrar: lo paga ella
    if (espera === 'CUOTA_SIN_VENCER') return { como: 'BANCO', via: 'remesa', desde: null, cuandoVenza: true };
    return { como: 'BANCO', via: 'remesa', desde: null };
  }

  return enLaApp(ctx);
}

/** Para el payload: solo los recibos que son deuda, por id. */
export function cobrosDeRecibosAlumna(
  recibos: readonly FilaReciboAlumna[], ctx: ContextoCobroAlumna,
): Record<string, CobroDeReciboAlumna> {
  const out: Record<string, CobroDeReciboAlumna> = {};
  for (const r of recibos) {
    const c = cobroDeReciboAlumna(r, ctx);
    if (c) out[r.id] = c;
  }
  return out;
}
