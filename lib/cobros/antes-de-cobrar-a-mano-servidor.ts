import 'server-only';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contextoCobroDe } from '../pos/terminal.ts';
import { consultarCobroBizum } from '../pos/consulta-stripe.ts';
import {
  MENSAJE_COBRO_EN_EL_DATAFONO, MENSAJE_PAGO_ONLINE_SIN_COMPROBAR, MENSAJE_YA_PAGADO_EN_EL_DATAFONO, MENSAJE_YA_PAGADO_ONLINE,
  cerrarPagoOnlineAntesDeCobrarAMano, soltarCobroDeMostradorAntesDeCobrarAMano, type SesionesDeStripe,
} from '../billing/pago-online-al-cobrar-a-mano.ts';
import { MENSAJE_COBRO_CON_METODO_GUARDADO, penalizacionesDeLosRecibos, recibosDePenalizacionAnulada } from './marcar-cobrado.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se comprueba JUSTO antes de cobrar un recibo fuera de Stripe: a mano en
// el mostrador («marcar cobrado») o con un movimiento del banco (cobros
// externos). Las dos puertas cobran un recibo que puede tener un pago en marcha
// por otro lado; si no se cierra, entran dos cobros reales.
//
// Era el cuerpo de `/api/cobros/marcar-cobrado`; vive aquí para que las dos
// puertas hagan exactamente lo mismo. Las decisiones puras siguen en
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

export type PagosEnMarcha =
  /** Se puede cobrar. `checkoutLeido` viaja al compare-and-set, que no cobra si cambió. */
  | { ok: true; checkoutLeido: string | null }
  | { ok: false; mensaje: string };

/**
 * Uno a uno: antes de cobrar el recibo se mira, EN ESE MOMENTO, si tiene un pago en
 * marcha. Un enlace de pago abierto se CIERRA en Stripe (que la clienta no pueda
 * pagarlo también online), y un cobro del datáfono o Bizum abandonado se cancela y
 * se suelta; si ya se pagó o sigue en curso, no se cobra.
 */
export async function soltarPagosEnMarchaAntesDeCobrar(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string },
  prepararStripe: () => Promise<StripeDelEstudio>,
): Promise<PagosEnMarcha> {
  const { studioId, reciboId } = p;
  const { data: fila, error: errFila } = await admin.from('recibos')
    .select('checkout_session_id, cobro_mostrador_pi, cobro_mostrador_checkout_session_id, cobro_off_session_clave')
    .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
  if (errFila) return { ok: false, mensaje: 'No se ha podido comprobar si tiene un cobro en marcha. Inténtalo otra vez.' };
  // Se está cobrando AHORA con su tarjeta o domiciliación guardada: no se cobra, y
  // antes de cerrarle el enlace o cancelar el datáfono para nada. El compare-and-set
  // de `confirmarCobro` lo vuelve a exigir (lib/billing/cobro-off-session-marca.ts).
  if (fila?.cobro_off_session_clave) return { ok: false, mensaje: MENSAJE_COBRO_CON_METODO_GUARDADO };

  const ref = (fila?.cobro_mostrador_pi as string | null) ?? null;
  if (ref) {
    const cs = (fila?.cobro_mostrador_checkout_session_id as string | null) ?? null;
    const s = await prepararStripe();
    const mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, s && {
      consultar: async () => (await consultarCobroBizum(s.stripe, ref, s.cuenta)).estado,
      // Solo ESTE cobro: nada de cancelar la acción del lector, que podría estar
      // cobrando otra venta en ese momento.
      cancelar: async () => {
        try {
          if (cs || ref.startsWith('cs_')) await s.stripe.checkout.sessions.expire(cs ?? ref, undefined, { stripeAccount: s.cuenta });
          else await s.stripe.paymentIntents.cancel(ref, {}, { stripeAccount: s.cuenta });
        } catch { /* lo dirá la siguiente consulta */ }
      },
      soltar: async () => {
        const { data, error } = await admin.from('recibos')
          .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
          .eq('id', reciboId).eq('studio_id', studioId).eq('cobro_mostrador_pi', ref).select('id');
        return !error && (data?.length ?? 0) > 0;
      },
    });
    if (mostrador.tipo === 'YA_PAGADO') {
      Sentry.captureMessage('[cobros] cobro a mano sobre un cobro del mostrador ya pagado', {
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId, referencia: ref },
      });
      return { ok: false, mensaje: MENSAJE_YA_PAGADO_EN_EL_DATAFONO };
    }
    if (mostrador.tipo === 'EN_MARCHA') return { ok: false, mensaje: MENSAJE_COBRO_EN_EL_DATAFONO };
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
      return { ok: false, mensaje: MENSAJE_YA_PAGADO_ONLINE };
    }
    if (online.tipo === 'NO_SE_SABE') return { ok: false, mensaje: MENSAJE_PAGO_ONLINE_SIN_COMPROBAR };
  }
  return { ok: true, checkoutLeido };
}

/** Lo que se dice cuando el recibo es de una penalización anulada o devuelta. */
export const MENSAJE_PENALIZACION_ANULADA = 'Es una penalización anulada o devuelta: no se cobra.';

/**
 * Toda la guarda de un recibo, en el orden de «Marcar cobrado»: penalización
 * anulada, y después los pagos en marcha. La usa el cobro con un movimiento del
 * banco (`lib/cobros-externos/servidor.ts`, `antesDeCobrar`).
 */
export function guardaAntesDeCobrar(admin: SupabaseClient, studioId: string) {
  const prepararStripe = preparadorDeStripe(admin, studioId);
  return async (p: { studioId: string; reciboId: string }): Promise<PagosEnMarcha> => {
    // El estudio de la llamada tiene que ser el de la sesión con que se preparó.
    if (p.studioId !== studioId) return { ok: false, mensaje: 'Ese recibo no es de este estudio.' };
    if (penalizacionesDeLosRecibos([p.reciboId]).length > 0
      && (await bloqueadosPorPenalizacion(admin, studioId, [p.reciboId])).has(p.reciboId)) {
      return { ok: false, mensaje: MENSAJE_PENALIZACION_ANULADA };
    }
    return soltarPagosEnMarchaAntesDeCobrar(admin, p, prepararStripe);
  };
}
