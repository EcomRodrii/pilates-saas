// Verificación de firma de los webhooks de Stripe, cerrada ante secretos vacíos.
//
// `stripe.webhooks.constructEvent(body, firma, secreto)` NO rechaza un secreto
// vacío: calcula el HMAC con esa clave vacía y compara. Si una variable de
// entorno de secreto falta en un despliegue, pasarle `secreto ?? ''` convierte
// la verificación en algo que cualquiera puede satisfacer. Esta función nunca
// intenta verificar con un secreto vacío: si no hay ninguno configurado, dice
// `sin-secreto` y la ruta responde 503.
//
// Admite varios secretos porque /api/stripe/webhook recibe en el mismo endpoint
// los eventos de la cuenta de plataforma y los de las cuentas conectadas, cada
// uno firmado con el suyo.

import type Stripe from 'stripe';

export type ResultadoFirmaStripe =
  | { ok: true; evento: Stripe.Event; /** Posición, en el array que se pasó, del secreto que verificó la firma. */ secretoIndice: number }
  | { ok: false; motivo: 'sin-secreto' }
  | { ok: false; motivo: 'firma-invalida'; error: unknown };

export function verificarFirmaStripe(
  stripe: Pick<Stripe, 'webhooks'>,
  cuerpo: string,
  firma: string,
  secretos: ReadonlyArray<string | null | undefined>,
): ResultadoFirmaStripe {
  // Se conserva la posición ORIGINAL de cada secreto: si falta el primero, el
  // segundo sigue siendo «el segundo» para quien pregunta cuál verificó.
  const configurados = secretos
    .map((s, indice) => ({ s, indice }))
    .filter((x): x is { s: string; indice: number } => typeof x.s === 'string' && x.s.trim().length > 0);
  if (configurados.length === 0) return { ok: false, motivo: 'sin-secreto' };

  let ultimoError: unknown = new Error('Falta la cabecera stripe-signature');
  if (!firma) return { ok: false, motivo: 'firma-invalida', error: ultimoError };

  for (const { s: secreto, indice } of configurados) {
    try {
      return { ok: true, evento: stripe.webhooks.constructEvent(cuerpo, firma, secreto), secretoIndice: indice };
    } catch (err) {
      ultimoError = err;
    }
  }
  return { ok: false, motivo: 'firma-invalida', error: ultimoError };
}
