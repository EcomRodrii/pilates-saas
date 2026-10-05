import 'server-only';
import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cerrarSiRechazadoDatafono } from './consulta-stripe.ts';
import { liberarCobroPosFallido } from './liberar-cobro-fallido.ts';
import { cerrarReciboPos, cerrarVentaPos } from './cerrar-cobro-pos.ts';
import { accionCobroDatafono, enVuelo, liberacionDatafono } from './barrido-datafono-reglas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El conciliador horario (lib/inngest/conciliar-cobros.ts) resuelve los cobros
// del datáfono de Stripe que nadie terminó de mirar: los que entraron sin que se
// cerrara la venta o el recibo, y los rechazados o abandonados que nadie anuló.
// La regla de qué hacer con cada uno, en lib/pos/barrido-datafono-reglas.ts.
//
// Solo actúa sobre lo que la base sigue teniendo EN VUELO con ESE cobro (una
// venta en PENDIENTE_PAGO que lo lleva, o un recibo con él en
// `cobro_mostrador_pi`), y con las mismas puertas que el aviso de Stripe:
// `cerrarVentaPos`/`cerrarReciboPos` para cerrar, y para anular solo con el
// cobro ya CERRADO en Stripe (`cerrarSiRechazadoDatafono`). Repetirse es gratis:
// las dos puertas son compare-and-set.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolverCobrosDatafonoColgados(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
  pis: Stripe.PaymentIntent[],
  ahoraSeg = Math.floor(Date.now() / 1000),
): Promise<{ cerrados: number; liberados: number }> {
  const resultado = { cerrados: 0, liberados: 0 };
  const candidatos = pis.flatMap((pi) => {
    const accion = accionCobroDatafono(pi, studio.id, ahoraSeg);
    return accion ? [{ pi, accion }] : [];
  });
  if (!candidatos.length) return resultado;

  const ventaIds = [...new Set(candidatos.map(c => c.pi.metadata.ventaId).filter((x): x is string => !!x))];
  const reciboIds = [...new Set(candidatos.map(c => c.pi.metadata.reciboId).filter((x): x is string => !!x))];
  let ventas: { id: string; stripe_payment_intent_id: string | null }[] = [];
  let recibos: { id: string; cobro_mostrador_pi: string | null }[] = [];
  if (ventaIds.length) {
    const { data, error } = await admin.from('ventas_pos').select('id, stripe_payment_intent_id')
      .eq('studio_id', studio.id).eq('estado', 'PENDIENTE_PAGO').in('id', ventaIds);
    if (error) throw new Error(`ventas en vuelo: ${error.message}`);
    ventas = (data ?? []) as typeof ventas;
  }
  if (reciboIds.length) {
    const { data, error } = await admin.from('recibos').select('id, cobro_mostrador_pi')
      .eq('studio_id', studio.id).in('id', reciboIds);
    if (error) throw new Error(`recibos en vuelo: ${error.message}`);
    recibos = (data ?? []) as typeof recibos;
  }

  // El lector del estudio, una vez por pasada. Si no se puede leer, no se sabe si
  // sigue con algún cobro: esta pasada no se da nada por rechazado ni abandonado.
  let lector: { readerId: string | null } | 'no-se-sabe' | undefined;
  for (const { pi, accion } of enVuelo(candidatos, ventas, recibos)) {
    const md = pi.metadata;
    try {
      let veredicto: 'pagado' | 'rechazado' | 'abandonado' | 'cancelado' | null =
        accion === 'cerrar' ? 'pagado' : accion === 'liberar' ? 'cancelado' : null;
      let final = pi;
      let rechazo: Stripe.PaymentIntent.LastPaymentError | undefined;
      if (accion === 'mirar') {
        if (lector === undefined) {
          const { data, error } = await admin.from('studios').select('stripe_terminal_reader_id').eq('id', studio.id).maybeSingle();
          lector = error ? 'no-se-sabe' : { readerId: (data as { stripe_terminal_reader_id: string | null } | null)?.stripe_terminal_reader_id ?? null };
        }
        if (lector === 'no-se-sabe') continue;
        const r = await cerrarSiRechazadoDatafono(stripe, pi.id, studio.stripe_account_id, lector.readerId, { sinTarjeta: true });
        final = r.pi;
        rechazo = r.rechazo;
        veredicto = r.veredicto === 'pagado' || r.veredicto === 'rechazado' || r.veredicto === 'abandonado' ? r.veredicto : null;
      }

      if (veredicto === 'pagado') {
        const cierre = md.ventaId
          ? await cerrarVentaPos(admin, {
            studioId: studio.id, ventaId: md.ventaId, referencia: final.id,
            importe: (final.amount_received ?? final.amount ?? 0) / 100,
            metodoPagoReal: null, concepto: md.concepto ?? null, aviso: 'conciliador',
          })
          : await cerrarReciboPos(admin, {
            studioId: studio.id, reciboId: md.reciboId as string, metodoCobro: 'TARJETA',
            paymentIntentId: final.id, referencia: final.id, aviso: 'conciliador',
          });
        if (cierre.ok) {
          resultado.cerrados++;
          // Lo normal es que lo cierre su aviso o la Caja: si llega hasta aquí, el
          // aviso se perdió, y recuperarlo en silencio escondería la avería.
          Sentry.captureMessage('[conciliador] cobro del datáfono cerrado por el barrido (el aviso de Stripe no lo cerró)', {
            level: 'warning', tags: { area: 'cobros', tipo: 'datafono-colgado' },
            extra: { studioId: studio.id, paymentIntentId: final.id, ventaId: md.ventaId, reciboId: md.reciboId },
          });
        }
      } else if (veredicto) {
        const { motivo, pagoEstado } = liberacionDatafono(veredicto, rechazo);
        await liberarCobroPosFallido(admin, { studioId: studio.id, metadata: md, paymentIntentId: pi.id, motivo, pagoEstado });
        resultado.liberados++;
      }
    } catch (e) {
      // Solo ids. El siguiente barrido lo vuelve a intentar.
      Sentry.captureException(e instanceof Error ? e : new Error('cobro del datáfono colgado'), {
        level: 'warning', tags: { area: 'cobros', tipo: 'datafono-colgado' },
        extra: { studioId: studio.id, paymentIntentId: pi.id, ventaId: md.ventaId, reciboId: md.reciboId },
      });
    }
  }
  return resultado;
}
