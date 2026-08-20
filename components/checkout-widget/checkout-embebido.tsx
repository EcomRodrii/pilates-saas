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
import { fuenteValida, urlFuenteGoogle } from '@/lib/reservar/config-widget';
import { semantic } from '@/lib/portal-tokens';

export function CheckoutEmbebido({
  t, plan, clientSecret, publishableKey, stripeAccountId, onExito, onBizum, onCerrar,
  resumenClase, textoBoton, ventanaCancelacionHoras, datosPago, fuentePago, radioInput,
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
  /**
   * Radio de INPUT del Widget Builder (`radiosDe(...).input`) para que los
   * campos de la tarjeta dentro del iframe de Stripe redondeen igual que los
   * inputs de fuera. Sin prop, el default de input del widget (`radius.spot`,
   * 15px) — antes se usaba `radius.card` (26px), que es un radio de TARJETA:
   * inputs de 44px con esquinas de 26px se leían como juguete, no como
   * checkout.
   */
  radioInput?: number;
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
  // La fuente elegida por el estudio, deducida del DOM igual que el color de
  // marca y por el mismo motivo.
  //
  // ⚠️ Existe la prop `fuentePago`, pero SOLO la pasaba un caller de tres
  // (el checkout de clase de Modo A). El de planes/bonos y todo Modo B caían
  // al literal de abajo, así que el bloque de tarjeta salía en Instrument Sans
  // por mucho que el snippet llevara `data-fuente`. Leerlo de `--font-ui` —que
  // los dos modos ya fijan— arregla los tres de una vez y deja la prop como
  // lo que debe ser: un override explícito, no el único camino.
  const [fuenteAuto, setFuenteAuto] = useState<{ familia: string; cssSrc: string | null } | null>(null);
  const fuenteCheckout = fuentePago ?? fuenteAuto ?? {
    // Último recurso: la fuente base del widget (Instrument Sans, la de
    // `sans`), pedida a Google Fonts porque dentro del iframe la copia
    // self-hosted de next/font no existe.
    familia: 'Instrument Sans',
    cssSrc: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap',
  };
  useEffect(() => {
    if (!marcaRef.current) return;
    const estilo = getComputedStyle(marcaRef.current);
    const valor = estilo.getPropertyValue('--portal-brand').trim();
    if (valor) setColorMarca(valor);

    // Del `font-family` resuelto solo interesa la PRIMERA familia. Y se exige
    // que sea un nombre limpio: sin fuente elegida, `--font-ui` la define
    // next/font y vale algo como `__Instrument_Sans_e8ce9c` —un alias local
    // con guiones bajos que Google Fonts no conoce—, así que pedirle esa URL
    // daría un 404 y el checkout se quedaría sin fuente. `fuenteValida` deja
    // fuera justo esos alias, y entonces cae al literal de arriba, que es el
    // comportamiento de siempre.
    const familia = (estilo.getPropertyValue('--font-ui').split(',')[0] ?? '')
      .trim().replace(/^['"]|['"]$/g, '');
    if (familia && fuenteValida(familia)) {
      setFuenteAuto({ familia, cssSrc: urlFuenteGoogle(familia) });
    }
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
          // El PaymentElement ya trae su propio skeleton por campo — con
          // 'always' se pinta desde el primer frame en vez de dejar un hueco
          // en blanco mientras carga el iframe (P1-confianza; ver además el
          // skeleton propio en <FormularioPago>, que cubre el hueco ANTES de
          // que exista iframe alguno).
          loader: 'always',
          appearance: {
            theme: 'stripe',
            // Labels flotantes, como el Checkout de Stripe propio (la
            // referencia de calidad del encargo): más compactas que 'above'
            // en 320-390px y con los `defaultValues` prefijados el label ya
            // nace arriba, nunca tapa el dato.
            labels: 'floating',
            variables: {
              colorPrimary: colorMarca,
              colorBackground: t.surface,
              colorText: t.ink,
              // El aviso legal/terms y los textos de apoyo del iframe salen
              // de aquí — integrados como secundario del tema, no en el
              // negro/serif por defecto de Stripe.
              colorTextSecondary: t.muted,
              colorTextPlaceholder: t.muted,
              colorDanger: semantic.danger.text,
              fontFamily: `'${fuenteCheckout.familia}', system-ui, sans-serif`,
              // Radio de INPUT (ver docblock de `radioInput`), nunca el de
              // tarjeta.
              borderRadius: `${radioInput ?? radius.spot}px`,
            },
            rules: {
              // Borde en reposo con la línea del tema (el default de Stripe
              // es un gris ajeno a la paleta del estudio) y focus ring del
              // color de marca — el mismo lenguaje de foco que los inputs
              // del paso 'datos' de fuera del iframe.
              '.Input': { borderColor: t.line, boxShadow: 'none' },
              '.Input:focus': { borderColor: colorMarca, boxShadow: `0 0 0 1px ${colorMarca}`, outline: 'none' },
              // El aviso legal de Stripe (terms), en cuerpo de secundario:
              // sin esto quedaba como un pegote a tamaño de párrafo.
              '.TermsText': { color: t.muted, fontSize: '11.5px' },
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
      confirmParams: {
        return_url: url.toString(),
        // Obligatorio en cuanto la dirección es `never` en el Element: Stripe
        // exige que la aporte quien la ocultó. Se manda SOLO el país, que es
        // lo único que este flujo sabe de verdad — nunca un código postal
        // heredado de otro sitio, que es justo el bug que se está cerrando.
        //
        // España fija, igual que `TZ_ESTUDIO`: el producto es presencial y
        // solo se vende en España (mismo criterio ya cerrado que dejó fuera
        // el selector de idioma y el de huso horario). Si algún día hay un
        // estudio fuera, esto sale de su ficha, no de aquí.
        payment_method_data: { billing_details: { address: { country: 'ES' } } },
      },
      redirect: 'if_required',
    });
    setEnviando(false);
    if (err) {
      // El motivo REAL del rechazo, que hasta ahora se perdía: `err.message`
      // es el texto para la persona, pero `decline_code` es lo único que
      // distingue «tarjeta sin fondos» de «el banco no acepta el código
      // postal». Sin esto, diagnosticar este bug exigía reproducirlo en
      // producción a ciegas. No cambia nada de lo que ve la clienta.
      //
      // ⚠️ Por consola y no con `Sentry.captureException`: este componente
      // TAMBIÉN se compila dentro de public/widget.js (esbuild, sin externals),
      // así que importar `@sentry/nextjs` aquí se llevaría medio SDK de Next al
      // bundle que se carga en la web del estudio. En Modo A la consola la
      // recoge el SDK del navegador igual, y es la misma vía que ya delató la
      // clave de Stripe mal puesta unas líneas más arriba.
      console.error('[checkout-embebido] pago rechazado', {
        type: err.type, code: err.code, declineCode: err.decline_code,
      });
      setError(err.message ?? 'No se ha podido procesar el pago.');
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onExito();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Mientras el iframe del PaymentElement no existe todavía (antes
          incluso del `loader: 'always'` de Stripe, que ya cubre la carga DE
          los campos) había un hueco en blanco de altura cero y el CTA
          "saltaba" hacia abajo al montar. El contenedor reserva la altura
          típica del bloque de tarjeta y pinta un shimmer encima hasta el
          `ready` — mismo keyframe `widget-skeleton-shimmer` que ya duplican
          app/globals.css y app/widget-bundle/widget.css (este componente
          también corre en el Shadow DOM del bundle). */}
      <div style={{ position: 'relative', minHeight: elementoListo ? undefined : 220 }}>
        {!elementoListo && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[44, 44, 44].map((h, i) => (
              <div key={i} style={{
                height: h, borderRadius: 12,
                background: `linear-gradient(100deg, ${t.surface2} 40%, ${t.line} 50%, ${t.surface2} 60%)`,
                backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite',
              }} />
            ))}
          </div>
        )}
        {/* `defaultValues`: sin esto, el banner de Link volvía a pedir el email
            y el teléfono que la persona acababa de escribir en el paso 1. */}
        <PaymentElement
          onReady={() => setElementoListo(true)}
          options={{
            // ⚠️ NO pedimos dirección de facturación en ningún paso de este
            // flujo — y hasta ahora no lo decíamos, que no es lo mismo. Sin
            // `fields`, regía el default de Stripe (`auto`): era ÉL quien
            // decidía pintar un campo de código postal dentro del bloque de
            // tarjeta. Con `labels: 'floating'` ese campo va sin rótulo
            // visible una vez escrito, así que se rellenaba (a mano o por el
            // autocompletar del navegador) sin que la persona registrara que
            // había introducido un código postal — y el banco lo rechazaba
            // por no coincidir con el de la tarjeta. De ahí el error absurdo:
            // «el código postal no coincide» en un formulario que, hasta
            // donde se ve, no pide ninguno.
            //
            // `never` lo quita del formulario Y de lo que se envía. No es
            // esconder el error: es dejar de mandar un dato que nunca
            // pedimos, con lo que la comprobación pasa a «no disponible» en
            // vez de «no coincide». La verificación antifraude real en España
            // es 3DS/SCA, que no depende de esto.
            fields: { billingDetails: { address: 'never' } },
            ...(datosPago ? {
              defaultValues: {
                billingDetails: {
                  name: datosPago.nombre || undefined,
                  email: datosPago.email || undefined,
                  phone: datosPago.telefono || undefined,
                },
              },
            } : {}),
          }}
        />
      </div>
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
        {enviando ? (
          // Spinner real, no solo texto — mismo patrón (clase `animate-spin`,
          // presente en Tailwind y duplicada en widget.css para el Shadow
          // DOM) que ya usa el CTA de la hoja de reserva.
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span aria-hidden className="animate-spin" style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.85, flexShrink: 0 }} />
            Procesando el pago…
          </span>
        ) : (textoBoton ?? `Pagar ${plan.precio} €`)}
      </button>
      {/* Línea de confianza (pantalla 04) — candado + un hecho VERAZ (el pago
          lo procesa Stripe de verdad; nada de sellos ni "100% seguro") + la
          ventana de cancelación REAL de esta clase, nunca un genérico. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11.5, color: t.muted, textAlign: 'center' }}>
        <Lock size={12} style={{ flexShrink: 0 }} />
        <span>
          Pago seguro procesado por Stripe
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
