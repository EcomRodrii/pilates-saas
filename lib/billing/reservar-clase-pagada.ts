// ─────────────────────────────────────────────────────────────────────────────
// «Pagar y reservar sin login previo» (docs/reserva-sin-login-diseno.md §4.2):
// reservar la clase que venía con la compra, una vez entregado el plan que la
// cubre.
//
// Esto es de la COMPRA, no del cobro: por eso no vive en `confirmar-cobro.ts`.
// Estaba copiado tres veces casi literal —webhook Checkout Session (Bizum sin
// login), webhook checkout embebido y conciliador—; los tres llaman ahora aquí
// y cada uno conserva su texto de alerta.
//
// Best-effort a propósito: el dinero y el plan ya están entregados, así que un
// fallo aquí no puede tumbar el evento. Pero es `error` y no `warning`: la socia
// ha PAGADO por una clase concreta y la pantalla ya le dijo que estaba
// reservada, así que si no se avisa nadie se entera. Además del aviso a Sentry
// se avisa al mostrador dentro del panel (I-3, auditoría 19-ago), que es quien
// puede llamarla hoy mismo.
//
// Idempotente por `res-web-<pi>` y serializado por el FOR UPDATE de
// `reservar_plaza`: la carrera webhook/conciliador acaba en YA_RESERVADA, no en
// plaza doble.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

export type ViaReservaPagada = 'checkout' | 'embebido' | 'conciliador';

const TEXTOS: Record<ViaReservaPagada, { sinPlaza: string; sinPago: string; contexto: string; tags?: Record<string, string> }> = {
  checkout: {
    sinPlaza: '[stripe webhook] checkout (Bizum sin login): plan entregado pero NO se pudo reservar la clase',
    sinPago: '[stripe webhook] checkout (Bizum sin login): sin payment_intent para reservar la clase',
    contexto: 'reservarPlazaTrasPagoPublico',
  },
  embebido: {
    sinPlaza: '[stripe webhook] checkout embebido: plan entregado pero NO se pudo reservar la clase',
    sinPago: '[stripe webhook] checkout embebido: sin payment_intent para reservar la clase',
    contexto: 'reservarPlazaTrasPagoPublico',
  },
  conciliador: {
    sinPlaza: '[conciliador] plan entregado pero NO se pudo reservar la clase pagada',
    sinPago: '[conciliador] sin payment_intent para reservar la clase pagada',
    contexto: 'conciliador reservarPlazaTrasPagoPublico',
    tags: { area: 'cobros', tipo: 'conciliado-sin-plaza' },
  },
};

export async function reservarClasePagada(
  admin: SupabaseClient,
  p: {
    studioId: string;
    sesionId: string;
    socioId: string;
    /** El cargo: sin él `reservarPlazaTrasPagoPublico` no tiene con qué ser idempotente. */
    paymentIntentId: string | null;
    /** Si la socia pagó por una camilla/plaza concreta, se le da ESA. */
    spotId: string | null;
    via: ViaReservaPagada;
    /** Ids de Stripe para localizar el caso en Sentry (`sessionId` o `paymentIntentId`). */
    referencia: Record<string, string>;
  },
): Promise<void> {
  const t = TEXTOS[p.via];
  if (!p.paymentIntentId) {
    // No debería pasar (un pago completado trae su payment_intent), pero si
    // pasara sería el mismo problema: dinero cobrado, clase sin reservar.
    Sentry.captureMessage(t.sinPago, {
      level: 'error', ...(t.tags ? { tags: t.tags } : {}),
      extra: { studioId: p.studioId, sesionId: p.sesionId, ...p.referencia },
    });
    return;
  }
  try {
    const { reservarPlazaTrasPagoPublico } = await import('@/lib/db/supabase-data-admin');
    const r = await reservarPlazaTrasPagoPublico({
      studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId,
      paymentIntentId: p.paymentIntentId, spotId: p.spotId,
    });
    if (!r.ok) {
      Sentry.captureMessage(t.sinPlaza, {
        level: 'error', ...(t.tags ? { tags: t.tags } : {}),
        extra: { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, ...p.referencia, motivo: r.motivo, detalle: r.detalle },
      });
      const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
      await emitirReservaPagadaSinPlaza(admin, { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId });
    } else if (r.estado === 'LISTA_ESPERA') {
      // Pagó y la clase se llenó entre crear el cobro y confirmarlo:
      // `reservar_plaza` la metió en la cola (ok:true). Desde el panel es una
      // fila de espera más, pero aquí hay dinero cobrado — el mostrador tiene
      // que poder llamarla hoy. Si se libera plaza, la promoción automática
      // sigue siendo el camino normal.
      const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
      await emitirReservaPagadaSinPlaza(admin, {
        studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, situacion: 'en-espera',
      });
    }
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error(t.contexto), {
      extra: { contexto: t.contexto, studioId: p.studioId, sesionId: p.sesionId, ...p.referencia },
    });
  }
}
