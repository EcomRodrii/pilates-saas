/**
 * ¿Sabemos DE QUIÉN es la ficha sobre la que acaba de caer una compra?
 *
 * El checkout embebido admite dos caminos (docs/reserva-sin-login-diseno.md):
 *
 *  - con `socioId`: la ruta lo validó contra el JWT (`socioAutenticado`) antes
 *    de crear el PaymentIntent, así que la identidad está demostrada;
 *  - de invitada, solo con `socioEmail`: `entregarPlanComprado` resuelve la
 *    ficha con `.ilike('email', …)`. Un email NO es una identidad demostrada:
 *    lo conoce cualquiera que haya coincidido con esa persona en el estudio.
 *
 * Cuando la compra de invitada cae sobre una ficha que YA EXISTÍA, quien pagó
 * y quien es dueño de la ficha pueden ser personas distintas. Entregar el plan
 * ahí es correcto —lo pagó de verdad y la titular recibe lo comprado—, pero
 * tocar sus credenciales de pago guardadas no: dejaría la tarjeta del que pagó
 * como método por defecto de la titular, y los cobros off-session del estudio
 * y las renovaciones automáticas pasarían a cargarse en ella.
 *
 * Si la ficha acaba de nacer de esta misma compra (`fichaCreada`) no hay
 * nadie a quien suplantar: la tarjeta es de quien acaba de darse de alta.
 */
export function identidadDemostradaEnCompra(args: {
  /** `socioId` de la metadata: presente solo si se validó contra el JWT. */
  socioIdVerificado: string | null | undefined;
  /** ¿La ficha se creó en esta entrega, en vez de resolverse por email? */
  fichaCreada: boolean;
}): boolean {
  return Boolean(args.socioIdVerificado) || args.fichaCreada;
}
