import 'server-only';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contextoCobroDe } from '../pos/terminal.ts';
import { consultarCobroBizum } from '../pos/consulta-stripe.ts';
import {
  MENSAJE_COBRO_EN_EL_DATAFONO, MENSAJE_PAGO_ONLINE_SIN_COMPROBAR, MENSAJE_YA_PAGADO_EN_EL_DATAFONO, MENSAJE_YA_PAGADO_ONLINE,
  cerrarPagoOnlineAntesDeCobrarAMano, cobroDeMostradorAbandonado, soltarCobroDeMostradorAntesDeCobrarAMano,
  type CobroDeMostradorAlCobrarAMano, type SesionesDeStripe,
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
    // A mano, quien cobra está en el mostrador: un cobro que sigue esperando se cancela ya.
    const mostrador = await soltarCobroDeMostradorDelRecibo(admin, {
      studioId, reciboId, referencia: ref,
      checkoutSessionId: (fila?.cobro_mostrador_checkout_session_id as string | null) ?? null,
    }, prepararStripe);
    if (mostrador.tipo === 'YA_PAGADO') return { ok: false, mensaje: MENSAJE_YA_PAGADO_EN_EL_DATAFONO };
    if (mostrador.tipo === 'EN_MARCHA') return { ok: false, mensaje: MENSAJE_COBRO_EN_EL_DATAFONO };
  }

  return cerrarPagoOnlineDelRecibo(admin, { studioId, reciboId }, (fila?.checkout_session_id as string | null) ?? null, prepararStripe);
}

/**
 * El cobro del datáfono o del Bizum del mostrador que quedó en el recibo
 * (`cobro_mostrador_pi`): se le pregunta a quien lo empezó y, si ya no puede cobrar,
 * se suelta la referencia (compare-and-set sobre ella).
 *
 * `cancelarPendienteTrasMs` decide qué se hace con uno que sigue ESPERANDO: a mano
 * (por defecto, 0) se cancela ya; la alumna que paga online solo lo da por
 * abandonado pasado el margen (`MINUTOS_COBRO_MOSTRADOR_ABANDONADO`).
 *
 * Nunca se le manda parar al lector: podría estar cobrando otra venta. Con SumUp
 * tampoco se cancela nada (no se sabe cuándo empezó): si no ha terminado, espera.
 */
export async function soltarCobroDeMostradorDelRecibo(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; referencia: string; checkoutSessionId: string | null },
  prepararStripe: () => Promise<StripeDelEstudio>,
  opciones: { cancelarPendienteTrasMs?: number; ahora?: Date } = {},
): Promise<CobroDeMostradorAlCobrarAMano> {
  const { studioId, reciboId, referencia: ref } = p;
  const margen = opciones.cancelarPendienteTrasMs ?? 0;
  const ahora = opciones.ahora ?? new Date();
  const soltarReferencia = async (r: string) => {
    const { data, error } = await admin.from('recibos')
      .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
      .eq('id', reciboId).eq('studio_id', studioId).eq('cobro_mostrador_pi', r).select('id');
    return !error && (data?.length ?? 0) > 0;
  };
  let mostrador: CobroDeMostradorAlCobrarAMano;
  // Un cobro del datáfono de SumUp (`sumup:`): se le pregunta a SumUp, no a Stripe.
  // Nunca se le manda parar (`terminate` para lo que esté haciendo el Solo, que
  // podría ser otra venta), y si no se le puede preguntar se espera: sin esto, un
  // estudio sin Stripe daba la referencia por vieja y se cobraba dos veces.
  if (proveedorDeReferencia(ref) === 'sumup') {
    const pre = await prepararCobroExistente(admin, studioId, ref, 'DATAFONO', { origen: '' });
    mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, pre.ok
      ? {
        consultar: async () => (await pre.cobro.consultar(ref)).estado,
        cancelar: async () => {},
        soltar: () => soltarReferencia(ref),
        // De SumUp no se sabe cuándo empezó: a mano se «cancela» (no hace nada) y se
        // vuelve a preguntar; online no se da por abandonado (lo suelta su barrido).
        pendienteCancelable: () => margen <= 0,
      }
      : { consultar: async () => 'ERROR', cancelar: async () => {}, soltar: async () => false });
  } else {
    const cs = p.checkoutSessionId;
    const s = await prepararStripe();
    let creadoEn: number | undefined;
    mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, s && {
      consultar: async () => {
        const c = await consultarCobroBizum(s.stripe, ref, s.cuenta);
        creadoEn = c.creadoEn;
        return c.estado;
      },
      // Solo ESTE cobro: nada de cancelar la acción del lector, que podría estar
      // cobrando otra venta en ese momento.
      cancelar: async () => {
        try {
          if (cs || ref.startsWith('cs_')) await s.stripe.checkout.sessions.expire(cs ?? ref, undefined, { stripeAccount: s.cuenta });
          else await s.stripe.paymentIntents.cancel(ref, {}, { stripeAccount: s.cuenta });
        } catch { /* lo dirá la siguiente consulta */ }
      },
      soltar: () => soltarReferencia(ref),
      pendienteCancelable: () => margen <= 0 || cobroDeMostradorAbandonado(creadoEn, ahora),
    });
  }
  if (mostrador.tipo === 'YA_PAGADO') {
    Sentry.captureMessage('[cobros] cobro de un recibo sobre un cobro del mostrador ya pagado', {
      level: 'warning', tags: { area: 'cobros', tipo: 'cobro-mostrador' }, extra: { reciboId, studioId, referencia: ref },
    });
  }
  return mostrador;
}

/**
 * El pago online (enlace o app) que el recibo tenga guardado se CIERRA en Stripe
 * antes de cobrarlo por otra vía, para que la clienta no pueda pagarlo también:
 * «marcar cobrado», «Cobrar online» (tarjeta guardada) y el datáfono / Bizum del
 * mostrador (`/api/pos/recibo`). Si ya lo pagó, o no se puede saber, no se cobra.
 * `checkoutLeido` viaja después al compare-and-set de quien cobra
 * (`exigirCheckoutLeido`).
 */
export async function cerrarPagoOnlineDelRecibo(
  _admin: SupabaseClient,
  p: { studioId: string; reciboId: string },
  checkoutLeido: string | null,
  prepararStripe: () => Promise<StripeDelEstudio>,
): Promise<PagosEnMarcha> {
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
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId: p.reciboId, studioId: p.studioId, sesionId: checkoutLeido },
      });
      return { ok: false, mensaje: MENSAJE_YA_PAGADO_ONLINE };
    }
    if (online.tipo === 'NO_SE_SABE') return { ok: false, mensaje: MENSAJE_PAGO_ONLINE_SIN_COMPROBAR };
  }
  return { ok: true, checkoutLeido };
}
