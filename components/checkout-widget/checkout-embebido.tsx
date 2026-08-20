'use client';

// Fase 3 (Booking Engine — Checkout embebido): confirmación de pago dentro
// del Shadow Root (Modo B), sin salir de la web del estudio. Diseño completo:
// docs/checkout-embebido-diseno.md §2-4.
//
// Solo tarjeta vía Payment Element — Bizum exige salir (acción externa en la
// app del banco) y se ofrece aparte, con aviso previo, reutilizando el
// Checkout Session existente (§4 del diseño). `redirect: 'if_required'`: si
// no hace falta 3DS ni ningún método con redirect, Stripe NO navega y esta
// promesa se resuelve en el propio Shadow Root.
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock, AlertTriangle } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { PlanTarifa } from '@/lib/types';
import { sans, serif, radius } from '@/lib/reservar-publico-tokens';
import { semantic } from '@/lib/portal-tokens';

export function CheckoutEmbebido({
  t, plan, clientSecret, publishableKey, stripeAccountId, onExito, onBizum, onCerrar,
  resumenClase, textoBoton, ventanaCancelacionHoras, datosPago, fuentePago,
}: {
  t: ModoTokens;
  plan: PlanTarifa;
  clientSecret: string;
  publishableKey: string;
  stripeAccountId: string;
  onExito: () => void;
  /**
   * Fallback con redirect avisado — reutiliza /api/stripe/checkout tal cual.
   * Opcional: el flujo "pagar y reservar sin login previo" no lo ofrece
   * todavía (esa ruta de Stripe no sabe reservar una clase, solo comprar un
   * plan — ofrecer Bizum ahí cobraría sin reservar, ver
   * docs/reserva-sin-login-diseno.md §9, Ruta B/Bizum deferred). Sin
   * `onBizum`, el botón no se pinta.
   */
  onBizum?: () => void;
  onCerrar: () => void;
  /**
   * "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
   * §3/§5): cuando el pago va atado a una clase concreta, un resumen breve
   * de qué se está reservando — para que la pantalla de pago no sea solo
   * "vas a pagar X €" sin contexto de qué clase es.
   */
  resumenClase?: { nombre: string; fecha: string; hora: string; instructor?: string | null };
  /**
   * Copy del botón de pago — "Pagar X € y reservar" cuando hay clase de por
   * medio. El importe NUNCA va precedido de flecha/guion/interpunto: "→ 1 €"
   * se leía como "-1 €" (queja literal del fundador).
   */
  textoBoton?: string;
  /**
   * Fase 2 del rediseño (docs/widget-reservas-theme-builder-diseno.md,
   * pantalla 04): la línea de confianza dice la ventana de cancelación REAL
   * de esta clase (mismo dato que ya enseña el paso 'confirm' del flujo con
   * plan) — nunca un genérico "cancelación gratuita" que pudiera no ser
   * cierto para este tipo de clase. `undefined`/`0` = sin esa línea.
   */
  ventanaCancelacionHoras?: number;
  /**
   * Los datos que la persona ACABA de escribir en el paso anterior — se
   * prefijan en el Payment Element (`defaultValues.billingDetails`) para que
   * Stripe (Link incluido) no vuelva a pedir email y teléfono recién
   * introducidos.
   */
  datosPago?: { nombre?: string; email?: string; telefono?: string };
  /**
   * La fuente REAL del widget para dentro del iframe de Stripe. Su
   * `appearance` no resuelve custom properties (`var(--font-ui)` ahí no
   * existe) ni ve las fuentes cargadas fuera del iframe: hacen falta nombres
   * de familia literales + la URL de Google Fonts (`fonts[].cssSrc`) para que
   * el bloque de tarjeta no salga en Times/serif del navegador.
   */
  fuentePago?: { familia: string; cssSrc: string | null };
}) {
  // `useMemo`, no una constante a nivel de módulo: `stripeAccount` cambia
  // según de qué estudio sea el widget (varios widgets, distintos estudios,
  // en la misma página con Modo B — ver comentario de montarUno en main.tsx).
  //
  // ⚠️ `loadStripe()` falla de DOS maneras distintas y hacen falta las dos redes:
  //
  //  1. SÍNCRONA, si no reconoce la forma de `publishableKey` (encontrado en
  //     CI: una clave con forma inválida tumbaba la página entera con el error
  //     boundary genérico, «Algo se ha roto», en vez de quedarse solo sin pago).
  //  2. RECHAZANDO LA PROMESA, que es lo que pasa de verdad en producción: si
  //     la clave es una `sk_`/`rk_` (secreta) Stripe.js valida DENTRO de la
  //     promesa y lanza `IntegrationError: You should not use your secret key
  //     with Stripe.js`. Visto en Sentry el 19-ago en /reservar (build
  //     361882dfa4fc, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mal puesta).
  //
  // Solo se cubría la 1. Con la 2, `stripePromise` NO era null, el guardia de
  // abajo no se disparaba y el fallback («El pago online no está disponible»)
  // no se pintaba nunca: `<Elements>` se quedaba montado con una promesa
  // rechazada y la socia veía un spinner eterno DESPUÉS de que el servidor ya
  // hubiera creado el PaymentIntent. Reserva perdida y PaymentIntent huérfano.
  const [stripeKo, setStripeKo] = useState(false);
  const stripePromise = useMemo(() => {
    try {
      return loadStripe(publishableKey, { stripeAccount: stripeAccountId });
    } catch {
      return null;
    }
  }, [publishableKey, stripeAccountId]);

  // El caso (2) solo se puede detectar suscribiéndose a la promesa: si se
  // rechaza, `stripePromise` sigue siendo un objeto (truthy), así que el
  // guardia `if (!stripePromise)` de abajo NO se dispara — y `<Elements>` con
  // una promesa rechazada (o resuelta a null) nunca monta el PaymentElement:
  // spinner eterno. Hace falta un estado real. El error se re-lanza a la
  // consola a propósito: era la ÚNICA señal que delató la env mal puesta.
  useEffect(() => {
    if (!stripePromise) return;
    let vivo = true;
    stripePromise
      .then(s => { if (vivo && !s) setStripeKo(true); })
      .catch((e: unknown) => {
        if (vivo) setStripeKo(true);
        console.error('[checkout-embebido] loadStripe falló', e);
      });
    return () => { vivo = false; };
  }, [stripePromise]);

  // Stripe Elements NO resuelve custom properties de CSS — su `appearance`
  // exige valores de color literales, no `var(--portal-brand)` como string
  // (el contenido del iframe es un documento aparte, ni siquiera lo vería).
  // Se lee el valor YA resuelto del propio nodo (dentro del shadow root,
  // donde `montarUno` en main.tsx fija `--portal-brand` en línea) una vez
  // montado, y hasta entonces se usa el color de tinta del tema como
  // fallback razonable en vez de dejar el pago sin marca.
  const marcaRef = useRef<HTMLDivElement>(null);
  const [colorMarca, setColorMarca] = useState(t.ink);
  // Fallback: la fuente base del widget (Instrument Sans, la de `sans`),
  // pedida a Google Fonts porque dentro del iframe la copia self-hosted de
  // next/font no existe.
  const fuenteCheckout = fuentePago ?? {
    familia: 'Instrument Sans',
    cssSrc: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap',
  };
  useEffect(() => {
    if (!marcaRef.current) return;
    const valor = getComputedStyle(marcaRef.current).getPropertyValue('--portal-brand').trim();
    if (valor) setColorMarca(valor);
  }, []);

  if (!stripePromise || stripeKo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: sans }}>
        <p style={{ fontSize: 13, color: semantic.warning.text, background: semantic.warning.soft, padding: '10px 12px', borderRadius: radius.cardSmall }}>
          El pago online no está disponible ahora mismo en este estudio.
        </p>
        <button type="button" onClick={onCerrar} style={{
          background: 'none', border: 'none', color: t.muted, fontSize: 12.5, cursor: 'pointer',
          textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, alignSelf: 'center',
        }}>
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div ref={marcaRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: sans }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: t.muted }}>Confirmar reserva</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: radius.cardSmall, background: t.surface2, border: `1px solid ${t.line}` }}>
        {resumenClase && (
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{resumenClase.nombre}</p>
            <p style={{ fontSize: 12, color: t.muted }}>
              {resumenClase.fecha} · {resumenClase.hora}{resumenClase.instructor ? ` · ${resumenClase.instructor}` : ''}
            </p>
          </div>
        )}
        {/* Separador punteado (pantalla 04 del handoff) — la clase y el total
            son dos ideas distintas: qué reservas, y qué pagas por ello. */}
        <div style={{ borderTop: `1px dashed ${t.line}` }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 12, color: t.muted }}>Total</p>
          <p style={{ fontFamily: serif, fontSize: 20, color: t.ink }}>{plan.precio} €</p>
        </div>
      </div>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          locale: 'es',
          // Ver el docblock de `fuentePago`: dentro del iframe de Stripe ni
          // existen las custom properties ni están cargadas nuestras fuentes.
          // Sin prop se pide la base del widget (Instrument Sans) a Google
          // Fonts, con system-ui de reserva mientras carga.
          fonts: fuenteCheckout.cssSrc ? [{ cssSrc: fuenteCheckout.cssSrc }] : undefined,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: colorMarca,
              colorBackground: t.surface,
              colorText: t.ink,
              fontFamily: `'${fuenteCheckout.familia}', system-ui, sans-serif`,
              borderRadius: `${radius.card}px`,
            },
          },
        }}
      >
        <FormularioPago
          t={t} plan={plan} onExito={onExito} onBizum={onBizum} onCerrar={onCerrar} textoBoton={textoBoton}
          ventanaCancelacionHoras={ventanaCancelacionHoras} datosPago={datosPago}
        />
      </Elements>
    </div>
  );
}

function FormularioPago({
  t, plan, onExito, onBizum, onCerrar, textoBoton, ventanaCancelacionHoras, datosPago,
}: {
  t: ModoTokens; plan: PlanTarifa; onExito: () => void; onBizum?: () => void; onCerrar: () => void;
  textoBoton?: string; ventanaCancelacionHoras?: number;
  datosPago?: { nombre?: string; email?: string; telefono?: string };
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `stripe` (useStripe) se pone en verdad en cuanto carga el SDK — antes de
  // que el PaymentElement (su propio iframe) termine de montarse y emita
  // `ready`. Con conexión lenta el botón quedaba pulsable en ese hueco:
  // `confirmPayment` reventaba con "We could not retrieve data from the
  // specified Element" (Sentry JAVASCRIPT-NEXTJS-1S, tráfico real embebido).
  const [elementoListo, setElementoListo] = useState(false);

  async function pagar() {
    if (!stripe || !elements || !elementoListo || enviando) return;
    setEnviando(true);
    setError(null);
    // El 3DS que SÍ exige salir (banco sin soporte para el modal embebido,
    // poco común) navega a `return_url` — se queda en la MISMA página del
    // estudio (Modo B corre en su DOM), con un marcador en la query que el
    // widget lee al remontar para avisar del resultado.
    const url = new URL(window.location.href);
    url.searchParams.set('tentare_pago', 'retorno');
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: url.toString() },
      redirect: 'if_required',
    });
    setEnviando(false);
    if (err) { setError(err.message ?? 'No se ha podido procesar el pago.'); return; }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onExito();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* `defaultValues`: sin esto, el banner de Link volvía a pedir el email
          y el teléfono que la persona acababa de escribir en el paso 1. */}
      <PaymentElement
        onReady={() => setElementoListo(true)}
        options={datosPago ? {
          defaultValues: {
            billingDetails: {
              name: datosPago.nombre || undefined,
              email: datosPago.email || undefined,
              phone: datosPago.telefono || undefined,
            },
          },
        } : undefined}
      />
      {error && (
        // Pantalla 06 del handoff (pago fallido) — SIN prometer un hold de
        // plaza que este flujo no tiene: aquí no se ha reservado nada
        // todavía (la reserva la crea el webhook tras el cobro), así que
        // decir "tu plaza sigue bloqueada" sería mentir. El único hecho
        // cierto es que no se ha cobrado nada — eso sí se dice.
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: radius.cardSmall, background: semantic.warning.soft }}>
          <AlertTriangle size={16} style={{ color: semantic.warning.text, flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: semantic.warning.text }}>No hemos podido procesar el pago</p>
            <p style={{ fontSize: 12, color: semantic.warning.text, marginTop: 2 }}>{error} No se ha realizado ningún cargo.</p>
            {/* Accionable, no solo diagnóstico: qué hacer ahora. El botón de
                pagar ya vuelve solo a su estado normal (setEnviando(false)
                antes de pintar este error). */}
            <p style={{ fontSize: 12, fontWeight: 600, color: semantic.warning.text, marginTop: 4 }}>
              Revisa los datos de la tarjeta o prueba con otra e inténtalo de nuevo.
            </p>
          </div>
        </div>
      )}
      <button
        type="button" disabled={!stripe || !elementoListo || enviando} onClick={pagar}
        aria-busy={enviando}
        style={{
          width: '100%', height: 52, borderRadius: radius.pillBtnSm, border: 'none', fontSize: 14, fontWeight: 800,
          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
          cursor: (!stripe || !elementoListo || enviando) ? 'default' : 'pointer', opacity: (!stripe || !elementoListo || enviando) ? 0.6 : 1,
        }}
      >
        {enviando ? 'Procesando…' : (textoBoton ?? `Pagar ${plan.precio} €`)}
      </button>
      {/* Línea de confianza (pantalla 04) — candado + la ventana de
          cancelación REAL de esta clase, nunca un genérico. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, color: t.muted }}>
        <Lock size={12} />
        <span>
          Pago seguro cifrado
          {!!ventanaCancelacionHoras && ` · Cancelación gratuita hasta ${ventanaCancelacionHoras}h antes`}
        </span>
      </div>
      {onBizum && (
        <button
          type="button" onClick={onBizum} disabled={enviando}
          style={{
            background: 'none', border: `1px solid ${t.line}`, borderRadius: radius.pillBtnSm, height: 44,
            color: t.ink, fontSize: 13, fontWeight: 700, cursor: enviando ? 'default' : 'pointer',
          }}
        >
          Pagar con Bizum
        </button>
      )}
      <button type="button" onClick={onCerrar} disabled={enviando} style={{
        background: 'none', border: 'none', color: t.muted, fontSize: 12.5, cursor: enviando ? 'default' : 'pointer',
        textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, alignSelf: 'center',
      }}>
        Cancelar
      </button>
    </div>
  );
}
