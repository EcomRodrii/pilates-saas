// Stripe.js falso para los e2e.
//
// Sin él, `js.stripe.com` no carga (no hay red en CI) y `CheckoutEmbebido` cae
// a su aviso de «no se ha podido cargar el pago»: el formulario ENTERO no se
// monta, así que nada de lo que hay dentro —el Payment Element, el botón de
// pagar, la casilla de aceptación— llega a existir para una prueba.
//
// Vivía dentro de `reservar-pago-confirmacion.spec.ts`. Se saca aquí al
// necesitarlo un segundo spec: dos copias de un stub acaban divergiendo, y la
// que se quede vieja falla por un motivo que no tiene nada que ver con lo que
// prueba.
//
// Lo que deja OBSERVABLE (todo en `window`, para leerlo con `page.evaluate`):
//
//   · `__TENTARE_STRIPE_INIT`     — cada `Stripe(pk, opciones)`: con qué clave y
//                                   con qué `stripeAccount` se cargó (el cargo
//                                   directo de Connect exige la cuenta del
//                                   estudio; sin ella el pago iría a la de Tentare).
//   · `__TENTARE_STRIPE_ELEMENTS` — las opciones con que se crea cada Elements
//                                   (`fonts` y `appearance` incluidos): es lo
//                                   único que el iframe de pago de verdad
//                                   llegaría a ver de la página.
//   · `__TENTARE_CONFIRM_LLAMADAS`— cuántas veces se llamó a `confirmPayment`.
//                                   Un test de camino de fallo SIN contador es
//                                   hueco (.claude/tentare-os.md): «no se cobró»
//                                   puede ser cierto por no haberlo intentado.
//   · `__TENTARE_EMBEDDED`        — cada Checkout incrustado creado
//                                   (`createEmbeddedCheckoutPage`): su
//                                   `clientSecret` y si llegó a montarse.
//
// Y lo que cada test ELIGE:
//
//   · `__TENTARE_CONFIRM` — qué devuelve `confirmPayment`:
//       'succeeded' (por defecto) · 'processing' · 'requires_payment_method'
//       · 'card_error' (rechazo del banco, con `decline_code`) · 'throw'
//       · 'reject' · 'pending' (NUNCA resuelve).
//   · `__TENTARE_CONFIRM_MENSAJE` — el texto del rechazo en 'card_error'.
//   · `__TENTARE_EMBEDDED_COMPLETE()` — simula que la alumna termina de pagar
//       dentro del Checkout incrustado: llama al `onComplete` que pasó la app.
//       Devuelve `false` si no había ninguno montado (el test lo debe exigir).
//
// ⚠️ Esto es un STUB: no hay red, no hay Stripe y no hay cobro. Que algo pase
// aquí no dice nada de Stripe de verdad; dice que la pantalla reacciona bien a
// cada respuesta posible. Lo real se prueba en el sandbox local
// (docs/STRIPE-MODO-TEST.md).
export const STRIPE_STUB = `
window.Stripe = function (pk, opcionesStripe) {
  (window.__TENTARE_STRIPE_INIT = window.__TENTARE_STRIPE_INIT || []).push({
    pk: pk, stripeAccount: (opcionesStripe && opcionesStripe.stripeAccount) || null,
  });
  var mkElement = function () {
    var handlers = {};
    var el = {
      mount: function (target) {
        var node = typeof target === 'string' ? document.querySelector(target) : target;
        if (node) node.textContent = 'stripe-stub';
        setTimeout(function () { (handlers['ready'] || []).forEach(function (f) { f(el); }); }, 50);
      },
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return el; },
      off: function () { return el; },
      once: function (ev, fn) { return el.on(ev, fn); },
      update: function () { return el; },
      destroy: function () {}, unmount: function () {},
      blur: function () {}, clear: function () {}, focus: function () {}, collapse: function () {},
    };
    return el;
  };
  return {
    elements: function (opciones) {
      (window.__TENTARE_STRIPE_ELEMENTS = window.__TENTARE_STRIPE_ELEMENTS || []).push(opciones || null);
      return {
        create: mkElement,
        getElement: function () { return null; },
        update: function () {},
        fetchUpdates: function () { return Promise.resolve({}); },
        submit: function () { return Promise.resolve({}); },
        on: function () {},
      };
    },
    createToken: function () { return Promise.resolve({}); },
    createPaymentMethod: function () { return Promise.resolve({}); },
    confirmCardPayment: function () { return Promise.resolve({}); },
    confirmPayment: function () {
      window.__TENTARE_CONFIRM_LLAMADAS = (window.__TENTARE_CONFIRM_LLAMADAS || 0) + 1;
      // El comportamiento lo elige cada test con window.__TENTARE_CONFIRM.
      var modo = window.__TENTARE_CONFIRM || 'succeeded';
      if (modo === 'throw') { throw new Error('IntegrationError simulado'); }
      if (modo === 'reject') { return Promise.reject(new Error('IntegrationError simulado')); }
      if (modo === 'pending') { return new Promise(function () {}); }  // NUNCA resuelve
      if (modo === 'card_error') {
        // La forma de un rechazo real: Stripe RESUELVE con { error }, no rechaza.
        return Promise.resolve({ error: {
          type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds',
          message: window.__TENTARE_CONFIRM_MENSAJE || 'Tu tarjeta no tiene fondos suficientes.',
        } });
      }
      if (modo === 'processing') {
        return Promise.resolve({ paymentIntent: { id: 'pi_stub', status: 'processing' } });
      }
      if (modo === 'requires_payment_method') {
        return Promise.resolve({ paymentIntent: { id: 'pi_stub', status: 'requires_payment_method' } });
      }
      return Promise.resolve({ paymentIntent: { id: 'pi_stub', status: 'succeeded' } });
    },
    // El Checkout INCRUSTADO (ui_mode 'embedded_page'): react-stripe-js 6.x lo
    // crea con esto desde <EmbeddedCheckoutProvider>.
    createEmbeddedCheckoutPage: function (opciones) {
      var registro = {
        clientSecret: (opciones && opciones.clientSecret) || null,
        montado: false,
        onComplete: (opciones && opciones.onComplete) || null,
      };
      (window.__TENTARE_EMBEDDED = window.__TENTARE_EMBEDDED || []).push(registro);
      window.__TENTARE_EMBEDDED_COMPLETE = function () {
        var vivos = (window.__TENTARE_EMBEDDED || []).filter(function (e) { return e.montado && e.onComplete; });
        var ultimo = vivos[vivos.length - 1];
        if (!ultimo) return false;
        ultimo.onComplete();
        return true;
      };
      return Promise.resolve({
        mount: function (target) {
          var node = typeof target === 'string' ? document.querySelector(target) : target;
          if (node) node.textContent = 'stripe-checkout-stub';
          registro.montado = true;
        },
        unmount: function () { registro.montado = false; },
        destroy: function () { registro.montado = false; },
      });
    },
    registerAppInfo: function () {},
    _registerWrapper: function () {},
  };
};
`;
