// ¿Se puede ofrecer Bizum para este cobro?
//
// Bizum es un pago PUNTUAL: no deja ni tarjeta ni mandato guardado. En una
// cuota (`tipo: 'MENSUAL'`, que cubre también trimestral y anual vía
// `periodicidadMeses`) eso rompe la renovación: el primer ciclo se cobra, y el
// siguiente no tiene con qué cobrarse solo — la alumna seguiría con su plan sin
// pagar, o se quedaría sin su mensualidad. Así que en cuotas solo tarjeta, que
// además se guarda para las renovaciones.
//
// Antes se ofrecía para cualquier plan «incluido MENSUAL», asumiendo que la
// socia volvería a pagar a mano (comentarios en `pagos-acciones.ts` y
// `app/reservar/[slug]/page.tsx`). Decisión del fundador (14-sep-2026): fuera
// de las cuotas.
//
// Lo usan el SERVIDOR (`/api/stripe/checkout`, la cerradura: ignora `bizum`
// en una cuota aunque se pida) y las pantallas (para no pintar un botón de
// Bizum que el servidor no va a atender). Un solo sitio para que no diverjan.

/**
 * `tipoPlan`: el `tipo` del plan que se cobra (`MENSUAL`, `BONO`, `PUNTUAL`),
 * `SIN_PLAN` si el cobro no cuelga de ningún plan (p. ej. una penalización), o
 * `null` si no se ha podido saber — y entonces tampoco: la tarjeta siempre
 * sirve, Bizum en una cuota no.
 */
export function bizumPermitidoPara(tipoPlan: string | null | undefined): boolean {
  if (tipoPlan == null) return false;
  return tipoPlan !== 'MENSUAL';
}

/**
 * El tipo de un RECIBO a efectos de Bizum, con lo que ya trae la fila.
 *
 * ⚠️ `entrega_tipo` NO dice de qué plan es el recibo: dice qué ENTREGÓ su cobro,
 * y se escribe DESPUÉS de cobrar (`renovacion-server.ts`, el panel). Un recibo
 * pendiente llega casi siempre con NULL. Y `NINGUNA` también se escribe en el
 * primer recibo de una cuota asignada desde la ficha: marcado DEVUELTO vuelve a
 * ser cobrable, y fiarse de `NINGUNA` como «sin plan» ofrecía Bizum en una
 * cuota (revisión de tentare-stripe, 14-sep). Solo `MENSUAL` sirve de atajo;
 * con suscripción, todo lo demás se consulta en su plan.
 */
export function tipoDeReciboParaBizum(
  entregaTipo: string | null,
  suscripcionId: string | null,
): 'MENSUAL' | 'SIN_PLAN' | 'CONSULTAR_PLAN' {
  if (entregaTipo === 'MENSUAL') return 'MENSUAL';
  if (!suscripcionId) return 'SIN_PLAN';
  return 'CONSULTAR_PLAN';
}

/**
 * La puerta del checkout: ¿se ofrece Bizum en esta sesión? Pedido Y permitido.
 * Vive aquí y no en la ruta para que tenga test: `node --test` no recorre
 * `app/api/`.
 */
export function ofrecerBizum(pedido: boolean, tipoPlan: string | null | undefined): boolean {
  return pedido && bizumPermitidoPara(tipoPlan);
}
