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

// ── «Cambiar tarjeta» / «Añadir tarjeta» desde la app (6-oct-2026) ───────────
//
// La alumna guarda la tarjeta de sus cobros automáticos desde Perfil → Método de
// pago, con un Checkout de Stripe INCRUSTADO en `mode: 'setup'` (sin salir de la
// app: la de iOS carga la web y la página de Stripe se abriría en Safari). El
// webhook (`checkout.session.completed`, `purpose: 'tarjeta'`) es quien la escribe
// en la ficha, igual que con el enlace que manda el panel. La pantalla solo dice
// «Tarjeta guardada» cuando el servidor lee en la ficha la tarjeta de ESA sesión.

/** Un id de sesión de Checkout con la forma de Stripe; cualquier otra cosa no se manda a Stripe. */
export function idDeSesionCheckoutValido(id: unknown): id is string {
  return typeof id === 'string' && /^cs_(test|live)_[A-Za-z0-9]+$/.test(id);
}

/**
 * Los parámetros de la sesión de Checkout que guarda la tarjeta desde la app. Todo
 * sale del SERVIDOR (estudio, alumna y Customer resueltos con su sesión): nada del body.
 *  - `mode: 'setup'`: no se cobra nada. Checkout crea el SetupIntent con
 *    `usage=off_session`, que es lo que deja cobrar sus cuotas sin ella delante, y
 *    pinta él el texto de autorización (mismo criterio que el enlace del panel).
 *  - `ui_mode: 'embedded_page'` + `redirect_on_completion: 'if_required'`: DENTRO
 *    de la app; una tarjeta nunca redirige, y si algo redirigiera vuelve a su app.
 *  - Solo tarjeta: es el hueco de cobros (`stripe_payment_method_id`).
 *  - `purpose: 'tarjeta'`: la rama del webhook que la escribe en la ficha.
 */
export function parametrosSesionGuardarTarjeta(p: {
  customer: string;
  studioId: string;
  socioId: string;
  /** Con `{CHECKOUT_SESSION_ID}` dentro. */
  returnUrl: string;
  /** Segundos Unix: abandonada, caduca pronto. */
  expiresAt: number;
}) {
  const metadata = { studioId: p.studioId, socioId: p.socioId, purpose: 'tarjeta', origen: 'app' };
  return {
    mode: 'setup' as const,
    ui_mode: 'embedded_page' as const,
    redirect_on_completion: 'if_required' as const,
    return_url: p.returnUrl,
    payment_method_types: ['card' as const],
    customer: p.customer,
    metadata,
    setup_intent_data: { metadata },
    expires_at: p.expiresAt,
    locale: 'es' as const,
  };
}

/** Lo que el servidor contesta al preguntar por una sesión de guardar tarjeta. */
export type ConfirmacionTarjeta =
  /** La ficha ya tiene la tarjeta de esta sesión: se puede decir «Tarjeta guardada». */
  | 'guardada'
  /** Stripe la autorizó y la ficha aún no la tiene (el webhook no ha llegado): se sigue preguntando. */
  | 'confirmando'
  /** La sesión no se completó (abierta, caducada, o el SetupIntent no salió bien). */
  | 'sin_completar'
  /** No es una sesión de guardar tarjeta de ESTA alumna en ESTE estudio. */
  | 'ajena';

export interface SesionDeTarjetaLeida {
  mode: string | null;
  status: string | null;
  metadata: Record<string, string> | null | undefined;
  /** El SetupIntent de la sesión, expandido. */
  setupIntent: { status: string | null; paymentMethodId: string | null } | null;
}

/**
 * ¿Está guardada la tarjeta de esta sesión? Solo `guardada` cuando la FICHA (lo que
 * usan los cobros) apunta al método que autorizó ESTA sesión: que Stripe diga que el
 * SetupIntent salió bien no basta, lo escribe el webhook.
 */
export function confirmacionTarjetaGuardada(
  s: SesionDeTarjetaLeida,
  p: { socioId: string; studioId: string; metodoDeLaFicha: string | null },
): ConfirmacionTarjeta {
  if (s.mode !== 'setup' || s.metadata?.purpose !== 'tarjeta') return 'ajena';
  if (s.metadata?.socioId !== p.socioId || s.metadata?.studioId !== p.studioId) return 'ajena';
  const pm = s.setupIntent?.paymentMethodId ?? null;
  if (s.status !== 'complete' || s.setupIntent?.status !== 'succeeded' || !pm) return 'sin_completar';
  return p.metodoDeLaFicha === pm ? 'guardada' : 'confirmando';
}

/** Lo que el webhook escribe en la ficha al guardar la tarjeta de cobros: el método y sus datos, en UN update. */
export function filaTarjetaDeCobros(
  paymentMethodId: string,
  datos: { expMes: number; expAnio: number; marca: string | null; ultimos4: string | null } | null,
  customer: string | null,
): Record<string, string | number | null> {
  // Los datos van en el MISMO update que el método. Antes se escribían después y
  // solo «si se podía»: al CAMBIAR de tarjeta, un fallo ahí dejaba la ficha con el
  // método nuevo y la marca y los cuatro dígitos de la vieja, y la app habría dicho
  // «Visa •••• 4242 guardada» de una tarjeta que ya no se cobra. Sin datos, a null.
  return {
    stripe_payment_method_id: paymentMethodId,
    ...(customer ? { stripe_customer_id: customer } : {}),
    tarjeta_marca: datos?.marca ?? null,
    tarjeta_ultimos4: datos?.ultimos4 ?? null,
    tarjeta_exp_mes: datos?.expMes ?? null,
    tarjeta_exp_anio: datos?.expAnio ?? null,
  };
}

/**
 * Al CAMBIAR la tarjeta de cobros, ¿se suelta en Stripe la que se ha sustituido?
 * Solo si era de cobros y nada más: una tarjeta que ella aceptó guardar para pagar en
 * la app (`allow_redisplay: 'always'`) sigue ahí (se ve y se quita en «Para pagar en la
 * app»), y nunca el método de sus domiciliaciones ni uno de otro Customer.
 */
export function debeSoltarTarjetaSustituida(p: {
  sustituida: string | null;
  nueva: string;
  sepaDeLaFicha: string | null;
  customerDeLaFicha: string | null;
  pmSustituido: { type?: string | null; allow_redisplay?: string | null; customer?: string | { id?: string } | null } | null;
}): boolean {
  if (!p.sustituida || p.sustituida === p.nueva || p.sustituida === p.sepaDeLaFicha || !p.pmSustituido) return false;
  if (p.pmSustituido.type !== 'card' && p.pmSustituido.type !== 'link') return false;
  if (p.pmSustituido.allow_redisplay === 'always') return false;
  return tarjetaEsSuya(p.pmSustituido.customer, p.customerDeLaFicha);
}
