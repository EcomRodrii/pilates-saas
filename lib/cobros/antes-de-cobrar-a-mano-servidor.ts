import 'server-only';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contextoCobroDe } from '../pos/terminal.ts';
import { anularCobroDelDatafono, desenlaceDeCobroSoltado } from '../pos/consulta-stripe.ts';
import { esMismoIntentoVivo, estadoParaSoltar } from '../pos/referencia-cobro-recibo.ts';
import {
  MENSAJE_COBRO_EN_EL_DATAFONO, MENSAJE_PAGO_ONLINE_SIN_COMPROBAR, MENSAJE_YA_PAGADO_EN_EL_DATAFONO, MENSAJE_YA_PAGADO_ONLINE,
  cerrarPagoOnlineAntesDeCobrarAMano, soltarCobroDeMostradorAntesDeCobrarAMano, type SesionesDeStripe,
} from '../billing/pago-online-al-cobrar-a-mano.ts';
import { MENSAJE_COBRO_CON_METODO_GUARDADO, penalizacionesDeLosRecibos, recibosDePenalizacionAnulada } from './marcar-cobrado.ts';
import { proveedorDeReferencia } from '../pos/sumup.ts';
import { prepararCobroExistente } from '../pos/cobro-del-estudio.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se comprueba JUSTO antes de cobrar un recibo a mano en el mostrador
// («marcar cobrado»): el recibo puede tener un pago en marcha por otro lado, y si
// no se cierra, entran dos cobros reales.
//
// Era el cuerpo de `/api/cobros/marcar-cobrado`. Las decisiones puras siguen en
// `pago-online-al-cobrar-a-mano.ts` y `marcar-cobrado.ts`, con sus tests.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los recibos que NO se cobran por ser de una penalización anulada o reembolsada.
 * Lee con service-role pero acotado al estudio de la sesión. Sin poder leer, deja
 * cobrar y lo registra: ver `recibosDePenalizacionAnulada`.
 */
export async function bloqueadosPorPenalizacion(
  admin: SupabaseClient, studioId: string, reciboIds: string[],
): Promise<Set<string>> {
  const penalizacionIds = penalizacionesDeLosRecibos(reciboIds);
  let estados: Map<string, string> | null = new Map();
  if (penalizacionIds.length > 0) {
    try {
      const { data, error } = await admin.from('penalizaciones').select('id, estado')
        .eq('studio_id', studioId).in('id', penalizacionIds);
      if (error) estados = null;
      else for (const fila of data ?? []) estados.set(fila.id as string, fila.estado as string);
    } catch {
      estados = null;
    }
  }
  const { bloqueados, sinComprobar } = recibosDePenalizacionAnulada(reciboIds, estados);
  if (sinComprobar.length > 0) {
    Sentry.captureMessage('[penalizaciones] cobro en mostrador sin poder comprobar la penalización', {
      level: 'warning',
      tags: { area: 'cobros', tipo: 'penalizacion-mostrador' },
      extra: { reciboIds: sinComprobar, studioId },
    });
  }
  return bloqueados;
}

export type StripeDelEstudio = { stripe: Stripe; cuenta: string } | null;

/**
 * Stripe del estudio, preparado una vez y solo si hace falta, con el mismo guardia
 * de modo que el resto de cobros (`contextoCobroDe`) y tiempos cortos: la pantalla
 * espera. `null` = no se puede consultar (y entonces no se cobra lo que lo necesite).
 */
export function preparadorDeStripe(admin: SupabaseClient, studioId: string): () => Promise<StripeDelEstudio> {
  let stripeDelEstudio: StripeDelEstudio | undefined;
  return async () => {
    if (stripeDelEstudio !== undefined) return stripeDelEstudio;
    const c = await contextoCobroDe(admin, studioId);
    if (!c.ok) {
      Sentry.captureMessage('[cobros] cobro a mano con un pago en marcha y sin Stripe para comprobarlo', {
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { studioId, motivo: c.motivo },
      });
      stripeDelEstudio = null;
    } else {
      stripeDelEstudio = {
        stripe: new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-06-24.dahlia', timeout: 5_000, maxNetworkRetries: 1 }),
        cuenta: c.ctx.stripeAccount,
      };
    }
    return stripeDelEstudio;
  };
}

/** Por qué no se cobra (cada camino lo dice a su manera: `mensajeCajaAntesDeCobrar`). */
export type MotivoPagoEnMarcha =
  | 'SIN_LEER' | 'COBRO_CON_METODO_GUARDADO' | 'YA_PAGADO_EN_EL_MOSTRADOR' | 'COBRO_EN_EL_MOSTRADOR'
  | 'YA_PAGADO_ONLINE' | 'PAGO_ONLINE_SIN_COMPROBAR';

export type PagosEnMarcha =
  /**
   * Se puede cobrar. `checkoutLeido` viaja al compare-and-set, que no cobra si cambió.
   * `referenciaQueSigue`: el cobro del mostrador que queda en el recibo; solo el del
   * MISMO intento repetido (`claveIntento`), que es el mismo cobro. Si no, `null`.
   */
  | { ok: true; checkoutLeido: string | null; referenciaQueSigue: string | null }
  | { ok: false; mensaje: string; motivo: MotivoPagoEnMarcha };

/**
 * Uno a uno: antes de cobrar el recibo se mira, EN ESE MOMENTO, si tiene un pago en
 * marcha. Un enlace de pago abierto se CIERRA en Stripe (que la clienta no pueda
 * pagarlo también online), y un cobro del datáfono o Bizum abandonado se cancela y
 * se suelta; si ya se pagó o sigue en curso, no se cobra.
 *
 * Lo usan el cobro a mano y, desde el 5-oct-2026, el arranque de un cobro de la Caja
 * (`app/api/pos/recibo`): antes abría el nuevo encima del anterior y, con Bizum en uno
 * y el datáfono en otro, los dos quedaban cobrables. Ahí manda el último: el cobro del
 * mostrador de otro intento se cancela, y el del mismo intento (`claveIntento`) no.
 */
export async function soltarPagosEnMarchaAntesDeCobrar(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; claveIntento?: string },
  prepararStripe: () => Promise<StripeDelEstudio>,
): Promise<PagosEnMarcha> {
  const { studioId, reciboId } = p;
  const { data: fila, error: errFila } = await admin.from('recibos')
    .select('checkout_session_id, cobro_mostrador_pi, cobro_mostrador_checkout_session_id, cobro_off_session_clave')
    .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
  if (errFila) return { ok: false, motivo: 'SIN_LEER', mensaje: 'No se ha podido comprobar si tiene un cobro en marcha. Inténtalo otra vez.' };
  // Se está cobrando AHORA con su tarjeta o domiciliación guardada: no se cobra, y
  // antes de cerrarle el enlace o cancelar el datáfono para nada. El compare-and-set
  // de `confirmarCobro` lo vuelve a exigir (lib/billing/cobro-off-session-marca.ts).
  if (fila?.cobro_off_session_clave) return { ok: false, motivo: 'COBRO_CON_METODO_GUARDADO', mensaje: MENSAJE_COBRO_CON_METODO_GUARDADO };

  const ref = (fila?.cobro_mostrador_pi as string | null) ?? null;
  let referenciaQueSigue: string | null = null;
  const soltarReferencia = async (r: string) => {
    const { data, error } = await admin.from('recibos')
      .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
      .eq('id', reciboId).eq('studio_id', studioId).eq('cobro_mostrador_pi', r).select('id');
    if (error) return false;
    if ((data?.length ?? 0) > 0) return true;
    // Sin fila: otro camino lo soltó a la vez (la Caja que lo esperaba, el aviso de
    // Stripe). Vale si ya no hay ninguno; si hay otro, es un intento nuevo.
    const { data: ahora, error: errAhora } = await admin.from('recibos').select('cobro_mostrador_pi')
      .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
    return !errAhora && !ahora?.cobro_mostrador_pi;
  };
  // Un cobro del datáfono de SumUp (`sumup:`): se le pregunta a SumUp, no a Stripe.
  // Nunca se le manda parar (`terminate` para lo que esté haciendo el Solo, que
  // podría ser otra venta), y si no se le puede preguntar se espera: sin esto, un
  // estudio sin Stripe daba la referencia por vieja y se cobraba dos veces.
  if (ref && proveedorDeReferencia(ref) === 'sumup') {
    const pre = await prepararCobroExistente(admin, studioId, ref, 'DATAFONO', { origen: '' });
    const mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, pre.ok
      ? { consultar: async () => (await pre.cobro.consultar(ref)).estado, cancelar: async () => {}, soltar: () => soltarReferencia(ref) }
      : { consultar: async () => 'ERROR', cancelar: async () => {}, soltar: async () => false });
    if (mostrador.tipo === 'YA_PAGADO') {
      Sentry.captureMessage('[cobros] cobro a mano sobre un cobro del mostrador ya pagado', {
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId, referencia: ref },
      });
      return { ok: false, motivo: 'YA_PAGADO_EN_EL_MOSTRADOR', mensaje: MENSAJE_YA_PAGADO_EN_EL_DATAFONO };
    }
    if (mostrador.tipo === 'EN_MARCHA') return { ok: false, motivo: 'COBRO_EN_EL_MOSTRADOR', mensaje: MENSAJE_COBRO_EN_EL_DATAFONO };
  } else if (ref) {
    const cs = (fila?.cobro_mostrador_checkout_session_id as string | null) ?? null;
    const s = await prepararStripe();
    // Se lee SIN tocarlo, y solo cuenta si es de este recibo (lo dice su metadata).
    const de = { reciboId, studioId };
    const leido = s ? await desenlaceDeCobroSoltado(s.stripe, ref, s.cuenta, de) : null;
    if (esMismoIntentoVivo(leido, p.claveIntento)) {
      // La Caja repitiendo la misma petición: es el mismo cobro, no se cancela.
      referenciaQueSigue = ref;
    } else {
      // Sin Stripe en el estudio no hay datáfono ni Bizum que pudieran cobrar: la
      // referencia es vieja y se suelta (antes se seguía sin soltarla, y quien guarda
      // después exige el recibo sin cobro del mostrador: no se podía cobrar).
      const mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, !s
        ? { consultar: async () => 'CANCELADO', cancelar: async () => {}, soltar: () => soltarReferencia(ref) }
        : {
        consultar: async () => estadoParaSoltar(await desenlaceDeCobroSoltado(s.stripe, ref, s.cuenta, de)),
        // Solo ESTE cobro. En el datáfono, `anularCobroDelDatafono` para su lector solo
        // si sigue con él (nunca el cobro de otra venta) y cancela el cobro aunque el
        // lector no responda; en Bizum, se caduca la sesión, que es lo que se paga.
        cancelar: async () => {
          try {
            if (cs || ref.startsWith('cs_')) await s.stripe.checkout.sessions.expire(cs ?? ref, undefined, { stripeAccount: s.cuenta });
            else if (leido?.comprobado && leido.metodo === 'DATAFONO') await anularCobroDelDatafono(s.stripe, ref, s.cuenta, null);
            else await s.stripe.paymentIntents.cancel(ref, {}, { stripeAccount: s.cuenta });
          } catch { /* lo dirá la siguiente consulta */ }
        },
        soltar: () => soltarReferencia(ref),
        });
      if (mostrador.tipo === 'YA_PAGADO') {
        Sentry.captureMessage('[cobros] cobro a mano sobre un cobro del mostrador ya pagado', {
          level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId, referencia: ref },
        });
        return { ok: false, motivo: 'YA_PAGADO_EN_EL_MOSTRADOR', mensaje: MENSAJE_YA_PAGADO_EN_EL_DATAFONO };
      }
      if (mostrador.tipo === 'EN_MARCHA') return { ok: false, motivo: 'COBRO_EN_EL_MOSTRADOR', mensaje: MENSAJE_COBRO_EN_EL_DATAFONO };
    }
  }

  const checkoutLeido = (fila?.checkout_session_id as string | null) ?? null;
  if (checkoutLeido) {
    const s = await prepararStripe();
    const sesiones: SesionesDeStripe | null = s && {
      consultar: id => s.stripe.checkout.sessions.retrieve(id, undefined, { stripeAccount: s.cuenta }),
      cerrar: id => s.stripe.checkout.sessions.expire(id, undefined, { stripeAccount: s.cuenta }),
    };
    const online = await cerrarPagoOnlineAntesDeCobrarAMano(checkoutLeido, sesiones);
    if (online.tipo === 'YA_PAGADO') {
      // Si el webhook rechazó esa sesión (otro importe, otra cuenta), el recibo no se
      // cerraría solo: que alguien lo vea.
      Sentry.captureMessage('[cobros] cobro a mano sobre un enlace de pago ya pagado', {
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId, sesionId: checkoutLeido },
      });
      return { ok: false, motivo: 'YA_PAGADO_ONLINE', mensaje: MENSAJE_YA_PAGADO_ONLINE };
    }
    if (online.tipo === 'NO_SE_SABE') return { ok: false, motivo: 'PAGO_ONLINE_SIN_COMPROBAR', mensaje: MENSAJE_PAGO_ONLINE_SIN_COMPROBAR };
  }
  return { ok: true, checkoutLeido, referenciaQueSigue };
}
