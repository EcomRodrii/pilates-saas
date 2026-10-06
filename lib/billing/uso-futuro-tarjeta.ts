// P0 del checkout embebido: `setup_future_usage` ya NO es incondicional.
//
// Antes el PaymentIntent llevaba SIEMPRE `setup_future_usage: 'off_session'`,
// y Stripe pintaba en el Payment Element el consentimiento de cargos futuros
// («permites que … cargue en tu tarjeta futuros pagos») incluso en la compra
// de una clase suelta de una invitada — un texto que asusta en un pago de
// 1 €, y encima la tarjeta ni siquiera llegaba a guardarse (el Customer de
// invitada fallaba en producción, ver el catch del handler).
//
// La regla queda atada al TIPO de plan, que es lo que decide si de verdad hay
// un cargo futuro:
//  - MENSUAL   → sí: la renovación automática necesita cobrar off-session.
//  - BONO      → no: se consume por sesiones, no se renueva sola.
//  - PUNTUAL   → no: una clase suelta no tiene ningún cargo futuro.
//
// El webhook no necesita cambio: `metodoReutilizableDe` ya devuelve null
// cuando el PI no pidió guardar la tarjeta, así que simplemente no la guarda.
import type { TipoPlan } from '../types.ts';

export function setupFutureUsageCheckout(tipo: TipoPlan): 'off_session' | undefined {
  return tipo === 'MENSUAL' ? 'off_session' : undefined;
}

/**
 * La misma regla para el Checkout HOSPEDADO (Bizum, enlace de pago, recibos), P16 6-oct-2026.
 *
 * Antes pedía `off_session` para TODO (bonos, clases sueltas, penalizaciones, citas): cada
 * pago guardaba la tarjeta para cobros automáticos sin que la alumna lo pidiera. Decisión del
 * fundador: una tarjeta se guarda solo si hace falta para un cargo futuro (la CUOTA) o si ella
 * marca «Guárdala para la próxima» (eso es el Payment Element de la app, no esta página).
 *  - cuota (MENSUAL) → `off_session` (la renovación se cobra sola);
 *  - un recibo de RENOVACIÓN cuyo tipo no se ha podido saber → `off_session` y aviso: no
 *    guardarla dejaría una cuota sin poder renovarse, que es el fallo caro;
 *  - lo demás (bono, suelta, sin plan, penalización, cita) → nada.
 */
export function usoFuturoCheckoutHospedado(p: { tipoPlan: string | null | undefined; esReciboDeRenovacion: boolean }): {
  usoFuturo: 'off_session' | undefined;
  avisar: boolean;
} {
  if (p.tipoPlan === 'MENSUAL') return { usoFuturo: 'off_session', avisar: false };
  const conocido = p.tipoPlan === 'BONO' || p.tipoPlan === 'PUNTUAL' || p.tipoPlan === 'SIN_PLAN';
  if (!conocido && p.esReciboDeRenovacion) return { usoFuturo: 'off_session', avisar: true };
  return { usoFuturo: undefined, avisar: false };
}
