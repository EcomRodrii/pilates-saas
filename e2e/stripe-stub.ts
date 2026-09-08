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
export const STRIPE_STUB = `
window.Stripe = function () {
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
    elements: function () {
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
      // El comportamiento lo elige cada test con window.__TENTARE_CONFIRM.
      var modo = window.__TENTARE_CONFIRM || 'succeeded';
      if (modo === 'throw') { throw new Error('IntegrationError simulado'); }
      if (modo === 'reject') { return Promise.reject(new Error('IntegrationError simulado')); }
      if (modo === 'pending') { return new Promise(function () {}); }  // NUNCA resuelve
      return Promise.resolve({ paymentIntent: { status: 'succeeded' } });
    },
    registerAppInfo: function () {},
    _registerWrapper: function () {},
  };
};
`;
