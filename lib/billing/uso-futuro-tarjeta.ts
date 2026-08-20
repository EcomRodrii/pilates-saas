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
