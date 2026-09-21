import type Stripe from 'stripe';

export type EstadoCobroCuenta = 'PUEDE' | 'NO_PUEDE' | 'SIN_RESPUESTA';

// Que el estudio tenga `stripe_account_id` no quiere decir que cobre: con el
// onboarding de Stripe a medias (identidad o banco sin verificar) la cuenta
// existe y `charges_enabled` sigue en false. Único sitio que lo decide; quien
// llama elige qué hacer si Stripe no contesta (el cobro no se intenta; la
// apertura lo enseña como «sin comprobar», nunca como hecho).
export async function estadoCobroCuenta(
  stripe: Stripe, stripeAccount: string, opciones: { timeoutMs?: number } = {},
): Promise<EstadoCobroCuenta> {
  // El timeout va también a la petición: sin él, la llamada seguiría viva en
  // segundo plano hasta el timeout del SDK aunque aquí ya no se espere.
  const lectura = stripe.accounts.retrieve(stripeAccount, undefined, opciones.timeoutMs ? { timeout: opciones.timeoutMs } : undefined)
    .then(c => (c.charges_enabled ? 'PUEDE' : 'NO_PUEDE') as EstadoCobroCuenta)
    .catch(() => 'SIN_RESPUESTA' as const);
  if (!opciones.timeoutMs) return lectura;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<EstadoCobroCuenta>(r => { timer = setTimeout(() => r('SIN_RESPUESTA'), opciones.timeoutMs); });
  try {
    return await Promise.race([lectura, tope]);
  } finally {
    clearTimeout(timer);
  }
}
