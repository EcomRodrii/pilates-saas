// ─────────────────────────────────────────────────────────────────────────────
// Qué se puede hacer con UN recibo (el ⋯ de la ficha de «Quién me debe», de «En
// el banco» y de «Lo que he cobrado»), en un solo sitio. Hoy lo decidían varios
// trozos del panel por separado.
//
// Las reglas no son nuevas: cada una tiene su dueño y aquí solo se componen.
//   · Lo que se debe (POR_COBRAR, IMPAGADO): «Cobrar» siempre; «Cobrar con su …»
//     sin ella delante solo si se puede (`medio-de-cobro.ts`) y el servidor lo
//     acepta (PENDIENTE o FALLIDO; un devuelto por el banco no); «El banco lo
//     devolvió» (`accionesDeDevolucion`); «Reintentar por el banco» si va a
//     entrar en la remesa; «Eliminar» si `puedeEliminarRecibo`.
//   · En el banco (EN_CURSO): con un cargo de Stripe en vuelo lo cierra Stripe;
//     si pudo salir en una remesa, «El banco lo ha cobrado / lo devolvió»; y
//     siempre «No llegó a ir al banco».
//   · Cobrado: su factura (o «Hacerle factura» si el estudio factura con
//     Tentare), y las dos devoluciones de `accionesDeDevolucion`, o «Devolver
//     desde su ficha» si entró por Stripe.
// Las que no se pueden ahora salen apagadas con su motivo, no escondidas.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { accionesDeDevolucion, cobroEntroPorStripe, type ReciboParaDevolver } from '../billing/devolucion-reglas.ts';
import { situacionRecibo } from '../billing/situacion-recibo.ts';
import { puedeEliminarRecibo } from '../recibos-eliminar.ts';

export type IdAccionRecibo =
  | 'COBRAR' | 'COBRAR_SIN_ELLA' | 'EL_BANCO_LO_DEVOLVIO' | 'REINTENTAR_POR_EL_BANCO'
  | 'EL_BANCO_LO_HA_COBRADO' | 'NO_LLEGO_AL_BANCO' | 'LO_CIERRA_STRIPE'
  | 'VER_FACTURA' | 'HACERLE_FACTURA' | 'LE_HE_DEVUELTO_EL_DINERO' | 'DEVOLVER_DESDE_SU_FICHA' | 'ELIMINAR';

export interface AccionDeRecibo {
  id: IdAccionRecibo;
  texto: string;
  /** Qué hace de verdad, o por qué está apagada. */
  nota?: string;
  desactivada?: boolean;
  peligro?: boolean;
}

export interface ReciboParaAcciones extends ReciboParaDevolver {
  id: string;
  socioId: string | null;
  fechaCobro?: string | null;
  fechaDevolucion?: string | null;
}

export interface ContextoDeAcciones {
  /** La factura del recibo, si la tiene. */
  factura: { numero: string } | null;
  /** El estudio factura con Tentare (`modoFacturacion === 'verifactu'`). */
  estudioFactura: boolean;
  /** El estudio prepara remesas (acreedor, IBAN y titular). */
  estudioHaceRemesas: boolean;
  /** Mandato VIGENTE de la clienta: solo con él entra en la próxima remesa. */
  mandatoVigente: boolean;
  /** Algún mandato, vigente o no: sin ninguno no pudo salir en una remesa. */
  algunMandato: boolean;
  /** El botón de cobrarle sin ella delante (`comoSeLePuedeCobrar(...).online`), o null. */
  cobroSinElla: { boton: string } | null;
  /** La cuota del recibo, si la tiene. */
  cuota: { estado: string } | null;
  /** Si el cobro automático ya lo va a cobrar: cuándo («el martes 6 oct»). */
  seCobraSoloEl: string | null;
}

export function accionesDeRecibo(r: ReciboParaAcciones, ctx: ContextoDeAcciones): AccionDeRecibo[] {
  const s = situacionRecibo(r);
  const dev = accionesDeDevolucion(r);
  const acciones: AccionDeRecibo[] = [];
  const eliminar = () => {
    if (puedeEliminarRecibo(r, { tieneFactura: !!ctx.factura }).ok) {
      acciones.push({ id: 'ELIMINAR', texto: 'Eliminar el recibo', peligro: true, nota: 'Con su motivo. Solo lo que aún no es dinero y no tiene un pago abierto.' });
    }
  };

  if (s === 'POR_COBRAR' || s === 'IMPAGADO') {
    acciones.push({ id: 'COBRAR', texto: 'Cobrar solo este recibo', nota: 'Eliges cómo te ha pagado' });
    if ((r.estado === 'PENDIENTE' || r.estado === 'FALLIDO') && r.socioId && ctx.cobroSinElla) {
      const motivo = ctx.cuota?.estado === 'PAUSADA' ? 'Su cuota está congelada: no se le cobra.'
        : ctx.seCobraSoloEl ? `Ya se cobra solo ${ctx.seCobraSoloEl}.` : null;
      acciones.push(motivo
        ? { id: 'COBRAR_SIN_ELLA', texto: ctx.cobroSinElla.boton, nota: motivo, desactivada: true }
        : { id: 'COBRAR_SIN_ELLA', texto: ctx.cobroSinElla.boton, nota: 'Se le cobra ahora, sin ella delante. Pide confirmar.' });
    }
    if (r.estado === 'DEVUELTO' && s === 'IMPAGADO' && ctx.estudioHaceRemesas && ctx.mandatoVigente) {
      acciones.push({ id: 'REINTENTAR_POR_EL_BANCO', texto: 'Reintentar por el banco', nota: 'Vuelve a la próxima remesa que prepares' });
    }
    if (dev.bancoLoDevolvio) {
      acciones.push({ id: 'EL_BANCO_LO_DEVOLVIO', texto: 'El banco lo devolvió', peligro: true, nota: 'Lo sigue debiendo' });
    }
    eliminar();
    return acciones;
  }

  if (s === 'EN_CURSO') {
    if (dev.loCierraStripe) {
      return [{ id: 'LO_CIERRA_STRIPE', texto: 'Lo cierra Stripe', desactivada: true, nota: 'Hay un cobro de Stripe en marcha: se cerrará solo.' }];
    }
    if (ctx.estudioHaceRemesas && ctx.algunMandato) {
      acciones.push({ id: 'EL_BANCO_LO_HA_COBRADO', texto: 'El banco lo ha cobrado', nota: 'Pasa a cobrado por domiciliación' });
      acciones.push({ id: 'EL_BANCO_LO_DEVOLVIO', texto: 'El banco lo devolvió', peligro: true, nota: 'Lo sigue debiendo' });
    }
    acciones.push({ id: 'NO_LLEGO_AL_BANCO', texto: 'No llegó a ir al banco', nota: 'Vuelve a «Sin cobrar»' });
    return acciones;
  }

  if (s === 'COBRADO' || s === 'REEMBOLSADO') {
    if (ctx.factura) acciones.push({ id: 'VER_FACTURA', texto: `Ver factura ${ctx.factura.numero}` });
    else if (ctx.estudioFactura && s === 'COBRADO') acciones.push({ id: 'HACERLE_FACTURA', texto: 'Hacerle factura', nota: 'Con su huella Veri*Factu' });
    if (dev.reembolsoAMano) acciones.push({ id: 'LE_HE_DEVUELTO_EL_DINERO', texto: 'Le he devuelto el dinero', nota: 'Ya no lo debe' });
    if (dev.bancoLoDevolvio) acciones.push({ id: 'EL_BANCO_LO_DEVOLVIO', texto: 'El banco lo devolvió', peligro: true, nota: 'Vuelve a deberlo' });
    // Un reembolso parcial por Stripe deja el resto devolvible: también desde su ficha.
    if (s === 'COBRADO' && r.socioId
        && cobroEntroPorStripe({ stripe_payment_intent_id: r.stripePaymentIntentId, metodo_cobro: r.metodoCobro, sepa_estado: r.sepaEstado })) {
      acciones.push({ id: 'DEVOLVER_DESDE_SU_FICHA', texto: 'Devolver desde su ficha', nota: 'Entró por Stripe: se devuelve por Stripe y el recibo se marca solo' });
    }
    return acciones;
  }

  // ANULADO (y lo que no cuenta): solo eliminarlo, si se puede.
  eliminar();
  return acciones;
}
