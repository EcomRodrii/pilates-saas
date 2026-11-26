'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { loadStripe, type Stripe, type StripeCheckoutExpressCheckoutElementOptions, type StripeElementsUpdateOptions, type StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import { BillingAddressElement, CheckoutElementsProvider, ExpressCheckoutElement, PaymentElement, useCheckoutElements } from '@stripe/react-stripe-js/checkout';
import { iniciarSuscripcion, prepararPagoIncrustado } from '@/lib/api-client';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import estilos from './reactivar.module.css';

type Plan = 'BASE' | 'ESTUDIO';

// El iframe de Stripe no ve las variables ni las letras de la página: valores
// literales y la fuente con URL absoluta (solo carga por https).
const APARIENCIA: NonNullable<StripeElementsUpdateOptions['appearance']> = {
  theme: 'stripe',
  labels: 'floating',
  // Número, caducidad y código en un solo bloque, como en la pantalla copiada.
  inputs: 'condensed',
  variables: {
    colorPrimary: '#101010', colorBackground: '#ffffff', colorText: '#101010', colorTextSecondary: '#616a6a',
    colorTextPlaceholder: '#616a6a', colorDanger: '#b3261e', borderRadius: '12px',
    fontFamily: 'Inter, system-ui, sans-serif', fontSizeBase: '14px', buttonBorderRadius: '9999px',
  },
  rules: {
    '.Input': { border: '1px solid #e1e3e3', boxShadow: '0 1px 2px rgba(0,0,0,.05)' },
    '.Input:focus': { borderColor: '#101010', boxShadow: '0 0 0 1px #101010' },
  },
};

// Los botones de arriba: Apple Pay y Google Pay, en una fila. `always`: Apple Pay también fuera de Safari
// (se paga escaneando con el iPhone). El resto no entra: la sesión es solo de tarjeta.
const EXPRES = {
  buttonHeight: 40,
  buttonTheme: { applePay: 'black', googlePay: 'black' },
  buttonType: { applePay: 'plain', googlePay: 'plain' },
  layout: { maxColumns: 2, maxRows: 1, overflow: 'never' },
  paymentMethodOrder: ['applePay', 'googlePay'],
  paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', amazonPay: 'never', paypal: 'never', klarna: 'never' },
} satisfies StripeCheckoutExpressCheckoutElementOptions;

type Preparado =
  | { paso: 'preparando' }
  | { paso: 'dentro'; secreto: string; stripe: Promise<Stripe | null> }
  /** Se paga en la página de Stripe: hay un descuento, o el formulario no ha podido cargar. */
  | { paso: 'fuera'; url?: string; porque: 'descuento' | 'sin-formulario' }
  | { paso: 'error'; mensaje: string };

export function PagoReactivar({ plan, email, complementosAparte }: { plan: Plan; email: string; complementosAparte: boolean }) {
  const [preparado, setPreparado] = useState<Preparado>({ paso: 'preparando' });
  const pedido = useRef(false);

  const preparar = useCallback(async () => {
    const clave = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!clave?.startsWith('pk_')) { setPreparado({ paso: 'fuera', porque: 'sin-formulario' }); return; }
    const r = await prepararPagoIncrustado(plan);
    if ('error' in r) { setPreparado({ paso: 'error', mensaje: r.error }); return; }
    if ('alojado' in r) { setPreparado({ paso: 'fuera', porque: 'descuento' }); return; }
    if ('url' in r) { setPreparado({ paso: 'fuera', url: r.url, porque: 'descuento' }); return; }
    // `loadStripe` falla de dos maneras (lanzando o rechazando la promesa): ver checkout-embebido.tsx.
    try {
      const stripe = loadStripe(clave, { locale: 'es' });
      stripe.then(s => { if (!s) setPreparado({ paso: 'fuera', porque: 'sin-formulario' }); })
        .catch(() => setPreparado({ paso: 'fuera', porque: 'sin-formulario' }));
      setPreparado({ paso: 'dentro', secreto: r.clientSecret, stripe });
    } catch {
      setPreparado({ paso: 'fuera', porque: 'sin-formulario' });
    }
  }, [plan]);

  // Una sola vez por visita: cada llamada abre un pago en Stripe.
  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    void preparar();
  }, [preparar]);

  const fallo = useCallback(() => setPreparado({ paso: 'fuera', porque: 'sin-formulario' }), []);

  if (preparado.paso === 'preparando') return <Cargando />;
  if (preparado.paso === 'error') {
    return (
      <div className={estilos.aviso}>
        <p role="alert">{preparado.mensaje}</p>
        <button type="button" className={estilos.pagar} onClick={() => { setPreparado({ paso: 'preparando' }); void preparar(); }}>
          Volver a intentarlo
        </button>
      </div>
    );
  }
  if (preparado.paso === 'fuera') return <PagoEnStripe plan={plan} url={preparado.url} porque={preparado.porque} complementosAparte={complementosAparte} />;
  return (
    <CheckoutElementsProvider
      stripe={preparado.stripe}
      options={{
        clientSecret: preparado.secreto,
        elementsOptions: {
          appearance: APARIENCIA,
          fonts: [{ family: 'Inter', src: `url(${window.location.origin}/fuentes-pago/inter-latin-wght-normal.woff2)`, weight: '100 900' }],
        },
      }}
    >
      <Formulario plan={plan} email={email} complementosAparte={complementosAparte} onFallo={fallo} />
    </CheckoutElementsProvider>
  );
}

function Cargando() {
  return <div className={estilos.espera} role="status" aria-label="Preparando el pago"><span className={estilos.barra} /></div>;
}

/** Qué se acepta al pagar. Va SIEMPRE junto al botón, se pague dentro o en Stripe. */
function Condiciones({ plan, complementosAparte }: { plan: Plan; complementosAparte: boolean }) {
  return (
    <p className={estilos.condiciones}>
      Cuando te suscribas, aceptas pagar {PLAN_INFO[plan].precioMes}&nbsp;€/mes ({PLAN_INFO[plan].nombre}), IVA incluido, a partir
      de hoy, y autorizas a Tentare a cobrarlo de tu tarjeta cada mes hasta que canceles. {complementosAparte && 'Centro de Control, sustituciones automáticas y redacción con IA se contratan aparte. '}
      Cancela cuando quieras en Configuración → Plan. <Link href="/terminos" target="_blank">Condiciones</Link>
    </p>
  );
}

function PagoEnStripe({ plan, url, porque, complementosAparte }: { plan: Plan; url?: string; porque: 'descuento' | 'sin-formulario'; complementosAparte: boolean }) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ir() {
    setAbriendo(true);
    setError(null);
    const r = url ? { url } : await iniciarSuscripcion(plan);
    if ('url' in r) window.location.assign(r.url);
    else { setError(r.error); setAbriendo(false); }
  }
  return (
    <div className={estilos.aviso}>
      <p>
        {porque === 'descuento'
          ? 'Tienes un descuento para este pago. Termínalo en la página segura de Stripe, donde se aplica.'
          : 'Termina el pago en la página segura de Stripe.'}
      </p>
      {error && <p role="alert" className={estilos.error}>{error}</p>}
      <button type="button" className={estilos.pagar} disabled={abriendo} onClick={() => void ir()}>
        {abriendo ? 'Abriendo…' : 'Continuar al pago'}
      </button>
      <Condiciones plan={plan} complementosAparte={complementosAparte} />
    </div>
  );
}

function Formulario({ plan, email, complementosAparte, onFallo }: { plan: Plan; email: string; complementosAparte: boolean; onFallo: () => void }) {
  const estado = useCheckoutElements();
  const [listo, setListo] = useState(false);
  const [express, setExpress] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (estado.type === 'error') onFallo(); }, [estado.type, onFallo]);

  if (estado.type !== 'success') return <Cargando />;
  const { checkout } = estado;

  async function pagar(evento?: StripeExpressCheckoutElementConfirmEvent) {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      // Si sale bien, Stripe lleva a /suscripcion, que confirma con el estado real.
      const r = await checkout.confirm({
        ...(checkout.email ? {} : { email }),
        ...(evento ? { expressCheckoutConfirmEvent: evento } : {}),
      });
      if (r.type === 'error') { setError(r.error.message); setEnviando(false); }
    } catch {
      setError('No hemos podido confirmar el pago. Comprueba tu conexión antes de volver a intentarlo.');
      setEnviando(false);
    }
  }

  return (
    <>
      {!listo && <Cargando />}
      <form className={estilos.formulario} hidden={!listo} onSubmit={e => { e.preventDefault(); void pagar(); }}>
        <div className={express ? estilos.express : undefined}>
          <ExpressCheckoutElement
            options={EXPRES}
            onReady={e => setExpress(Object.values(e.availablePaymentMethods ?? {}).some(Boolean))}
            onConfirm={e => void pagar(e)}
          />
        </div>
        {express && <p className={estilos.o}>o</p>}
        <PaymentElement
          // La autorización del cobro va junto al botón (`Condiciones`), no dentro del formulario.
          options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never', link: 'never' }, terms: { card: 'never' } }}
          onReady={() => setListo(true)}
          onLoadError={onFallo}
        />
        <div className={estilos.direccion}><BillingAddressElement options={{ display: { name: 'split' } }} /></div>
        {error && <p role="alert" className={estilos.error}>{error}</p>}
        <button type="submit" className={estilos.pagar} disabled={enviando}>
          {enviando ? 'Confirmando…' : `Suscribirse por ${checkout.total.total.amount}`}
        </button>
        <Condiciones plan={plan} complementosAparte={complementosAparte} />
      </form>
    </>
  );
}
