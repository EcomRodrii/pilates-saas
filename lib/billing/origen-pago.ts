// ─────────────────────────────────────────────────────────────────────────────
// A qué pantalla devuelve Stripe cuando termina el pago.
//
// `/api/stripe/checkout` es semipúblico a propósito (una socia paga sin sesión
// de staff), así que NO se puede deducir de la autenticación quién ha empezado
// el pago: hay que decirlo. De ahí `origen`.
//
// ⚠️ `origen` es una ETIQUETA, nunca una URL. El cliente elige entre rutas
// internas fijas y nada más; aceptar una URL del cuerpo sería un redirect
// abierto de manual, y encima uno que Stripe visita después de cobrar.
// Cualquier valor desconocido cae en el destino de siempre.
//
// El bug que lo motiva: el `success_url` mandaba a `/cobros` siempre que
// hubiera `reciboId`, asumiendo —y así lo decía el comentario— que "los cobros
// de recibo sí los inicia el estudio desde su panel". Dejó de ser verdad cuando
// el portal ganó los botones "Pagar" y "Renovar": la socia pagaba 175 € y
// aterrizaba en el login del PANEL DE STAFF, con un "¿Eres del equipo?" y sin
// una sola palabra sobre su pago.
// ─────────────────────────────────────────────────────────────────────────────

export type OrigenPago = 'portal' | 'panel';

/** Valida lo que llega en el cuerpo. Cualquier otra cosa es `undefined`. */
export function parsearOrigenPago(valor: unknown): OrigenPago | undefined {
  return valor === 'portal' || valor === 'panel' ? valor : undefined;
}

export interface UrlsRetorno { successUrl: string; cancelUrl: string }

/**
 * Resuelve a dónde vuelve la persona, por orden de especificidad:
 *
 * 1. `origen: 'portal'` → su propio portal. Manda sobre todo lo demás: quien
 *    paga desde ahí es la socia, tenga recibo o plan.
 * 2. Compra de plan sin recibo y sin origen → el enlace público `/reservar`,
 *    que es de donde viene ese camino.
 * 3. Resto → el panel del estudio.
 *
 * Sin `slug` no hay portal al que volver, así que se cae al panel en vez de
 * componer una ruta rota.
 */
export function urlsDeRetorno(p: {
  origen: OrigenPago | undefined;
  appUrl: string;
  slug: string | null;
  esCompraDePlan: boolean;
  reciboId?: string | null;
}): UrlsRetorno {
  if (p.origen === 'portal' && p.slug) {
    const base = `${p.appUrl}/portal/${p.slug}/compras`;
    return { successUrl: `${base}?pago=ok`, cancelUrl: `${base}?pago=cancelado` };
  }
  if (p.esCompraDePlan) {
    const base = `${p.appUrl}/reservar/${p.slug ?? ''}`;
    return { successUrl: `${base}?compra=ok`, cancelUrl: `${base}?compra=cancelada` };
  }
  const recibo = p.reciboId ? `&recibo=${p.reciboId}` : '';
  return {
    successUrl: `${p.appUrl}/cobros?tab=pendientes&stripe_success=1${recibo}`,
    cancelUrl: `${p.appUrl}/cobros?tab=pendientes&stripe_cancel=1`,
  };
}
