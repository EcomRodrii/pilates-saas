// ─────────────────────────────────────────────────────────────────────────────
// ¿Se va a cobrar sola esta deuda, y cuándo? Lo que dice la pantalla de Cobros
// («Se reintenta sola el martes 6 oct») tiene que ser lo que hace de verdad el
// cobro automático diario (`lib/inngest/dunning.ts`):
//   · pasa una vez al día (`PASADA_COBRO_AUTOMATICO_UTC`) y coge los PENDIENTE
//     con `proximo_reintento` vencido en ese momento: uno programado para
//     después de esa hora espera a la pasada del día siguiente;
//   · solo en estudios con Stripe conectado;
//   · con la regla de cuota de siempre (`puedeIntentarCobro`, vía AUTOMATICO):
//     cuota congelada, cancelada sin «seguir reintentando» o marcada «sin
//     reintentos» → no se cobra sola;
//   · con el método que elegiría el cobro (`elegirMetodoCobro`, y cliente de
//     Stripe): sin tarjeta ni domiciliación de Stripe, la pasada lo salta cada día
//     sin contarlo;
//   · y una tarjeta caducada se intenta y falla: avanza hacia el impago.
// Un recibo con `proximo_reintento` que no cumple todo eso NO va al chip «Se
// reintenta solo»: se dice por qué no se cobrará solo.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { puedeIntentarCobro, type ReciboParaCobrar } from '../billing/cobro-permitido.ts';
import { elegirMetodoCobro } from '../billing/metodo-cobro.ts';
import { caducaAntesDe } from '../billing/tarjeta-caducidad.ts';
import { PASADA_COBRO_AUTOMATICO_UTC } from '../billing/dunning.ts';

const DIA_MS = 86_400_000;

/** El primer momento de pasada del cobro automático en o después de `desde`. */
export function primeraPasadaDesde(desde: Date): Date {
  const { hora, minuto } = PASADA_COBRO_AUTOMATICO_UTC;
  const mismoDia = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate(), hora, minuto, 0, 0);
  return new Date(desde.getTime() <= mismoDia ? mismoDia : mismoDia + DIA_MS);
}

/**
 * La pasada que cogerá un recibo con este `proximo_reintento`. Si ya venció y hoy
 * ya pasó la pasada (la de hoy no lo cogió: sin método, un pago online abierto…),
 * la siguiente.
 */
export function pasadaQueLoCoge(proximoReintento: Date, ahora: Date): Date {
  return primeraPasadaDesde(proximoReintento.getTime() > ahora.getTime() ? proximoReintento : ahora);
}

/** Lo que la pantalla necesita de la clienta para saber con qué se le cobraría. */
export interface PagoGuardadoDeLaClienta {
  /** Sin cliente de Stripe no hay cobro sin ella delante (`cobrarReciboOffSession`). */
  stripeCustomerId?: string | null;
  metodoPagoPreferido?: string | null;
  stripePaymentMethodId?: string | null;
  sepaPaymentMethodId?: string | null;
  sepaMandateId?: string | null;
  tarjetaExpMes?: number | null;
  tarjetaExpAnio?: number | null;
}

export type ReintentoAutomatico =
  /** Lo cobra la pasada de `cuando`, con su tarjeta o por domiciliación (Stripe). */
  | { tipo: 'SE_COBRA_SOLO'; cuando: Date; metodo: 'TARJETA' | 'SEPA' }
  /** Tiene un reintento programado pero no se cobrará solo (o fallará): el porqué. */
  | { tipo: 'NO_SE_COBRA_SOLO'; motivo: string }
  /** No se han podido leer sus datos de pago: no se afirma nada. */
  | { tipo: 'NO_SE_SABE' };

export function reintentoAutomatico(p: {
  recibo: ReciboParaCobrar;
  /** La cuota del recibo, o `null` si no tiene (matrícula, venta suelta…). */
  cuota: { estado: string } | null;
  estudioConStripe: boolean;
  /** `null` si sus datos de pago no se han podido leer (o no los ve este rol). */
  clienta: PagoGuardadoDeLaClienta | null;
  ahora: Date;
}): ReintentoAutomatico | null {
  const { recibo, cuota, clienta, ahora } = p;
  if (!recibo.proximoReintento) return null;

  const permitido = puedeIntentarCobro(recibo, cuota, 'AUTOMATICO');
  if (!permitido.ok) {
    switch (permitido.motivo) {
      case 'CUOTA_PAUSADA': return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo mientras su cuota esté congelada.' };
      case 'CUOTA_CANCELADA': return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo: su cuota está cancelada.' };
      case 'SIN_REINTENTOS': return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo: al cancelar su cuota se decidió no reintentarlo.' };
      default: return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo.' };
    }
  }
  if (!p.estudioConStripe) {
    return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo: el estudio no tiene conectados los cobros con tarjeta.' };
  }
  if (!clienta) return { tipo: 'NO_SE_SABE' };

  const metodo = elegirMetodoCobro({
    metodo_pago_preferido: clienta.metodoPagoPreferido ?? null,
    stripe_payment_method_id: clienta.stripePaymentMethodId ?? null,
    sepa_payment_method_id: clienta.sepaPaymentMethodId ?? null,
    sepa_mandate_id: clienta.sepaMandateId ?? null,
  });
  if (!metodo.ok || !clienta.stripeCustomerId) {
    return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'No se cobrará solo: no tiene tarjeta ni domiciliación guardadas.' };
  }
  const cuando = pasadaQueLoCoge(new Date(recibo.proximoReintento), ahora);
  if (metodo.metodo === 'TARJETA'
      && caducaAntesDe({ expMes: clienta.tarjetaExpMes ?? null, expAnio: clienta.tarjetaExpAnio ?? null }, cuando)) {
    return { tipo: 'NO_SE_COBRA_SOLO', motivo: 'Se intentará con su tarjeta, pero está caducada: fallará. Pídele una nueva.' };
  }
  return { tipo: 'SE_COBRA_SOLO', cuando, metodo: metodo.metodo };
}
