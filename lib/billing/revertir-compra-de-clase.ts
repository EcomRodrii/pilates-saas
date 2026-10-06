// ─────────────────────────────────────────────────────────────────────────────
// PR-14 · Devolver el dinero de una clase COMPENSADA la saca de la cola y del bono
// (P06, Fase A, 6-oct-2026).
//
// Quien pagó una clase y se quedó sin plaza (pago COMPENSADA en `pagos_clase`)
// conserva lo que compró (`sus-web-…`) y, en espera, su sitio con prioridad. Si el
// estudio le devuelve el dinero ENTERO, o pierde la disputa entera, las dos cosas se
// van con él. Lo hace la RPC `revertir_compra_de_clase` (migr …_revertir_compra_de_clase),
// en una transacción e idempotente; aquí:
//   · cuándo: reembolso TOTAL del cargo y con todos sus reembolsos YA `succeeded`
//     (uno `pending` puede fallar días después y la alumna habría pagado y perdido el
//     bono; lo recoge `charge.refund.updated` cuando se confirma), o disputa perdida
//     por el importe entero del pago. Un parcial no revierte nada;
//   · se localiza el pago por su PaymentIntent (único) o, sin él, por la suscripción
//     del recibo (`rec-web-…` → `sus-web-…`);
//   · se sigue lo que la RPC no puede hacer en SQL: si la alumna tenía la OFERTA del
//     hueco, avisar a la siguiente (o descontarle y avisarla si subió directa).
//
// Nunca lanza, pero un fallo (la RPC, un interbloqueo repetido) devuelve `ok: false`
// para que el webhook conteste 500 y Stripe lo REINTENTE: anotar la devolución es
// idempotente y la RPC también. Si no, una disputa perdida no se reintentaría nunca
// (el conciliador ya la ve cerrada) y la alumna se quedaría con el bono y la prioridad.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { esTablaQueFalta } from '../db/tabla-que-falta.ts';
import { conReintentoPorInterbloqueo } from '../reservas/consumo-bono-reserva.ts';
import { origenDeReembolso } from './registrar-devolucion.ts';

/** Lo que devuelve la RPC (una fila). */
export interface ReversionCompraDeClase {
  cambiado: boolean;
  estado_pago: string;
  reserva_cancelada: boolean;
  bono_revertido: boolean;
  motivo_sin_revertir: string | null;
  sesion_clase_id: string | null;
  suscripcion_entregada_id: string | null;
  promovida_id: string | null;
  oferta_id: string | null;
  oferta_hasta: string | null;
}

export interface ResultadoReversionCompra {
  /** `false`: algo falló y hay que reintentar (el webhook contesta 500). */
  ok: boolean;
  reversion: ReversionCompraDeClase | null;
}

/**
 * ¿Es el recibo del PLAN de un pago online (`rec-web-<base>`)? Los pagos de clase
 * nacen siempre así (`idsDe`, lib/billing/ids-compra.ts); la matrícula aparte
 * (`rec-web-mat-…`) no entrega nada que revertir. Filtro barato: el conciliador
 * repasa los mismos reembolsos en cada pasada.
 */
export function esReciboDePagoOnline(reciboId: string): boolean {
  return reciboId.startsWith('rec-web-') && !reciboId.startsWith('rec-web-mat-');
}

/** El CARGO entero está devuelto (lo dice Stripe, o el acumulado llega a un total conocido). */
export function reembolsoTotalDelCargo(c: { refunded: boolean; amount: number | null; amountRefunded: number | null }): boolean {
  if (c.refunded) return true;
  if (!c.amount || c.amount <= 0) return false;
  return origenDeReembolso({ refunded: false, acumulado: c.amountRefunded ?? 0, total: c.amount }) === 'REEMBOLSO_TOTAL';
}

/**
 * ¿Han salido ya de verdad los reembolsos del cargo? Ninguno `pending` ni
 * `requires_action` (los `failed`/`canceled` no cuentan: el total ya los descuenta).
 */
export function reembolsosConfirmados(refunds: { status: string | null }[]): boolean {
  return refunds.length > 0 && refunds.every(r => r.status !== 'pending' && r.status !== 'requires_action');
}

/** Lo justo de Stripe que hace falta para listar los reembolsos de un cargo (testeable sin red). */
export interface ListaReembolsos {
  refunds: { list(params: { charge: string; limit: number }, opts: { stripeAccount: string }): AsyncIterable<{ status: string | null }> };
}

/** Lee los reembolsos del cargo. `null` si Stripe no contestó (se reintenta). */
export async function reembolsosDelCargoConfirmados(stripe: ListaReembolsos, chargeId: string, stripeAccount: string): Promise<boolean | null> {
  try {
    const refunds: { status: string | null }[] = [];
    for await (const r of stripe.refunds.list({ charge: chargeId, limit: 100 }, { stripeAccount })) {
      refunds.push({ status: r.status });
      if (refunds.length >= 100) break;
    }
    return reembolsosConfirmados(refunds);
  } catch (e) {
    avisoExcepcion(e instanceof Error ? e : new Error('listar reembolsos del cargo'), {
      level: 'warning', tags: { area: 'cobros', tipo: 'pago-clase-reversion' }, extra: { chargeId },
    });
    return null;
  }
}

// Sentry nunca puede tumbar esto (y fuera de Next, en `node --test`, el SDK no está iniciado).
function avisoMensaje(...a: Parameters<typeof Sentry.captureMessage>): void {
  try { Sentry.captureMessage(...a); } catch { /* sin Sentry */ }
}
function avisoExcepcion(...a: Parameters<typeof Sentry.captureException>): void {
  try { Sentry.captureException(...a); } catch { /* sin Sentry */ }
}

const ID_STRIPE = /^(pi|cs)_[A-Za-z0-9_]+$/;
const ID_PROPIO = /^[A-Za-z0-9_-]+$/;

/**
 * Si el recibo es el de un pago de clase COMPENSADA, lo revierte (RPC) y sigue lo que
 * haga falta. `reversion: null` si no había nada que revertir.
 */
export async function revertirCompraDeClaseDelRecibo(
  admin: SupabaseClient,
  p: {
    studioId: string; reciboId: string;
    /** El PaymentIntent del cargo: localiza el pago aunque su `suscripcion_id` no se rellenara. */
    paymentIntentId?: string | null;
    /** Disputa: lo que se pierde, en céntimos. Por debajo de lo que costó la clase, no se revierte. */
    importeDevueltoCentimos?: number | null;
    motivo: 'reembolso' | 'disputa'; fuente: string;
  },
): Promise<ResultadoReversionCompra> {
  if (!esReciboDePagoOnline(p.reciboId)) return { ok: true, reversion: null };
  try {
    const { data: rec } = await admin.from('recibos').select('suscripcion_id')
      .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
    const suscripcionId = (rec?.suscripcion_id as string | null | undefined) ?? null;
    const pi = p.paymentIntentId && ID_STRIPE.test(p.paymentIntentId) ? p.paymentIntentId : null;
    if (!suscripcionId && !pi) return { ok: true, reversion: null };

    let consulta = admin.from('pagos_clase').select('id, importe_centimos, matricula_centimos')
      .eq('studio_id', p.studioId).eq('estado', 'COMPENSADA');
    // Por su PaymentIntent; por la suscripción solo si el pago no lo tiene apuntado (un
    // reembolso de OTRO cargo del mismo recibo no puede revertir este). `.or()` interpola:
    // solo con ids de forma conocida (ni comas ni paréntesis).
    consulta = pi && suscripcionId && ID_PROPIO.test(suscripcionId) ? consulta.or(`payment_intent_id.eq.${pi},and(payment_intent_id.is.null,suscripcion_id.eq.${suscripcionId})`)
      : suscripcionId ? consulta.eq('suscripcion_id', suscripcionId)
      : consulta.eq('payment_intent_id', pi!);
    const { data: pagos, error: errPago } = await consulta;
    if (errPago) {
      if (esTablaQueFalta(errPago)) return { ok: true, reversion: null };
      avisoMensaje('[pago de clase] reembolso: no se pudo leer el pago compensado', {
        level: 'error', tags: { area: 'cobros', tipo: 'pago-clase-reversion' },
        extra: { studioId: p.studioId, reciboId: p.reciboId, detalle: errPago.message },
      });
      return { ok: false, reversion: null };
    }
    let ok = true;
    let ultima: ReversionCompraDeClase | null = null;
    for (const f of (pagos ?? []) as { id: string; importe_centimos: number; matricula_centimos: number }[]) {
      // Una disputa perdida por menos de lo que costó la clase es parcial: no se revierte nada.
      if (p.importeDevueltoCentimos != null && p.importeDevueltoCentimos < (f.importe_centimos ?? 0) + (f.matricula_centimos ?? 0)) continue;
      const { data, error } = await conReintentoPorInterbloqueo(() =>
        admin.rpc('revertir_compra_de_clase', { p_studio_id: p.studioId, p_pago_clase_id: f.id }));
      if (error) {
        ok = false;
        avisoMensaje('[pago de clase] reembolso: no se pudo revertir la compra de la clase', {
          level: 'error', tags: { area: 'cobros', tipo: 'pago-clase-reversion' },
          extra: { studioId: p.studioId, reciboId: p.reciboId, pagoClaseId: f.id, motivo: p.motivo, fuente: p.fuente, detalle: error.message },
        });
        continue;
      }
      const r = ((data as ReversionCompraDeClase[] | null) ?? [])[0] ?? null;
      if (!r || !r.cambiado) continue;
      ultima = r;
      await seguirTrasRevertir(admin, p, f.id, r);
    }
    return { ok, reversion: ultima };
  } catch (e) {
    avisoExcepcion(e instanceof Error ? e : new Error('revertir compra de clase'), {
      level: 'error', tags: { area: 'cobros', tipo: 'pago-clase-reversion' },
      extra: { studioId: p.studioId, reciboId: p.reciboId, motivo: p.motivo, fuente: p.fuente },
    });
    return { ok: false, reversion: null };
  }
}

async function seguirTrasRevertir(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; motivo: 'reembolso' | 'disputa'; fuente: string },
  pagoClaseId: string,
  r: ReversionCompraDeClase,
): Promise<void> {
  // No se le quitó el bono: queda la revisión de la devolución PENDIENTE para que la
  // propietaria decida con los números delante. Solo se avisa si fue por estar usado.
  if (!r.bono_revertido && r.motivo_sin_revertir === 'BONO_USADO') {
    avisoMensaje('[pago de clase] devuelto con el bono ya usado: queda para revisar a mano', {
      level: 'warning', tags: { area: 'cobros', tipo: 'pago-clase-reembolso-bono-usado' },
      extra: { studioId: p.studioId, reciboId: p.reciboId, pagoClaseId, suscripcionId: r.suscripcion_entregada_id, motivo: p.motivo },
    });
  }
  // Tenía la oferta del hueco: la RPC ya se lo dio a la siguiente; aquí, sus avisos
  // (y su descuento si subió directa), por el mismo dueño que al cancelar.
  if (r.sesion_clase_id && (r.promovida_id || r.oferta_id)) {
    try {
      const { seguirPromocionDeEspera } = await import('@/lib/db/supabase-data-admin');
      await seguirPromocionDeEspera(admin, {
        studioId: p.studioId, sesionId: r.sesion_clase_id,
        promovidaSocioId: r.promovida_id, ofertaSocioId: r.oferta_id, ofertaExpiraEn: r.oferta_hasta,
      });
    } catch (e) {
      // La promoción ya está hecha en la base de datos: un aviso que falla no la deshace.
      avisoExcepcion(e instanceof Error ? e : new Error('avisar la promoción tras revertir'), {
        level: 'error', tags: { area: 'reservas' }, extra: { studioId: p.studioId, sesionId: r.sesion_clase_id },
      });
    }
  }
}
