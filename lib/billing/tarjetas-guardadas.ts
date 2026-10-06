// Tarjetas guardadas para pagar en un toque dentro de la app (P16, 6-oct-2026).
//
// Decisión del fundador: una tarjeta se guarda SOLO si la alumna marca la casilla
// «Guárdala para la próxima» (la pinta Stripe en el Payment Element, desmarcada),
// nunca por defecto. Guardada así queda en SU Customer de la cuenta del estudio con
// `allow_redisplay: 'always'` y uso `on_session`: sirve para pagar ella en la app,
// NO para cobros automáticos. El hueco de cobros automáticos de la ficha
// (`socios.stripe_payment_method_id`) lo sigue escribiendo solo
// `guardarMetodoDeCompra`, y solo con un pago que pidió `off_session` (la cuota):
// `metodoReutilizableDe` devuelve null para uno `on_session`.
//
// Puro, sin `@/`: lo prueba `node --test`.

/**
 * ¿Se crea la CustomerSession (la que deja enseñar y guardar tarjetas)? Las tres cosas:
 *  - la socia sale del TOKEN (nunca una invitada, nunca un id del cuerpo);
 *  - hay Customer;
 *  - la petición viene de la app o del portal de Tentare: sin `Origin` (misma
 *    navegación) o con el `Origin` de la app. NUNCA desde la web de un estudio
 *    (widget): allí la página es de otro y no debe ver las tarjetas de nadie.
 */
export function debeCrearSesionDeTarjetas(p: {
  socioPorToken: boolean;
  customerId: string | null;
  origin: string | null;
  appUrl: string | null | undefined;
}): boolean {
  if (!p.socioPorToken || !p.customerId) return false;
  if (!p.origin) return true;
  let propio: string | null = null;
  try { propio = p.appUrl ? new URL(p.appUrl).origin : null; } catch { propio = null; }
  return !!propio && p.origin === propio;
}

/**
 * Los permisos de la sesión para el Payment Element.
 *  - Una CUOTA (el cobro ya pide `off_session`) no ofrece la casilla: ya se guarda para
 *    renovar, por la vía de siempre (`guardarMetodoDeCompra`).
 *  - Lo demás (bono, clase suelta, prueba, recibo): la casilla, desmarcada, con uso `on_session`.
 *  - Solo se re-enseñan las que ella aceptó guardar (`always`), como mucho 3, y quitar va
 *    por Perfil (no desde el pago).
 */
export function componentesSesionDeTarjetas(usoFuturo: 'off_session' | undefined | null) {
  const guardar = usoFuturo === 'off_session' ? 'disabled' as const : 'enabled' as const;
  return {
    payment_element: {
      enabled: true,
      features: {
        payment_method_save: guardar,
        ...(guardar === 'enabled' ? { payment_method_save_usage: 'on_session' as const } : {}),
        payment_method_redisplay: 'enabled' as const,
        payment_method_allow_redisplay_filters: ['always' as const],
        payment_method_redisplay_limit: 3,
        payment_method_remove: 'disabled' as const,
      },
    },
  };
}

export interface TarjetaGuardada {
  id: string;
  marca: string;
  ultimos4: string;
  /** «09/27». */
  caducidad: string | null;
  /** Es la del hueco de cobros automáticos (la cuota). */
  paraCobros: boolean;
}

/** Lo mínimo de un PaymentMethod de Stripe que hace falta para listarlo. */
export interface PaymentMethodMin {
  id: string;
  type?: string | null;
  allow_redisplay?: string | null;
  card?: { brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null } | null;
}

/**
 * Las tarjetas que ve en Perfil: las que aceptó guardar (`always`) y la de los cobros
 * automáticos (aunque no fuera `always`). Ninguna más: una tarjeta del Customer que ella no
 * pidió guardar no se enseña.
 */
export function tarjetasVisibles(pms: readonly PaymentMethodMin[], idCobros: string | null): TarjetaGuardada[] {
  return pms
    .filter((pm) => pm.type === 'card' && pm.card && (pm.allow_redisplay === 'always' || pm.id === idCobros))
    .map((pm) => ({
      id: pm.id,
      marca: pm.card?.brand ?? 'tarjeta',
      ultimos4: pm.card?.last4 ?? '····',
      caducidad: pm.card?.exp_month && pm.card?.exp_year
        ? `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}` : null,
      paraCobros: pm.id === idCobros,
    }));
}

/** Un id de PaymentMethod con la forma de Stripe; cualquier otra cosa no se manda a Stripe. */
export function idDeTarjetaValido(id: unknown): id is string {
  return typeof id === 'string' && /^pm_[A-Za-z0-9]+$/.test(id);
}

/** ¿Puede quitar ESTA tarjeta? Solo si es de su Customer (de la cuenta del estudio). */
export function tarjetaEsSuya(pmCustomer: string | { id?: string } | null | undefined, customerDeLaFicha: string | null): boolean {
  const de = typeof pmCustomer === 'string' ? pmCustomer : (pmCustomer?.id ?? null);
  return !!de && !!customerDeLaFicha && de === customerDeLaFicha;
}

/**
 * ¿Se puede quitar desde Perfil? Solo una TARJETA que ella aceptó guardar (`always`), y nunca el método de sus
 * domiciliaciones SEPA (con el id que sea): quitarlo dejaría sin cobrar sus cuotas por el banco.
 */
export function puedeQuitarseDesdeLaApp(pm: Pick<PaymentMethodMin, 'id' | 'type' | 'allow_redisplay'>, sepaDeLaFicha: string | null): boolean {
  return pm.type === 'card' && pm.allow_redisplay === 'always' && pm.id !== sepaDeLaFicha;
}
