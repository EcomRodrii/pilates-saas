import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { clasificarErrorCobro } from './clasificar-error-cobro.ts';

// D-5 (auditoría 20-ago): esta es la línea que separa "el dunning avanza su
// ciclo" de "reintenta con la MISMA Idempotency-Key". Equivocarse hacia
// FALLO_COBRO es el doble cargo real (contador arriba → clave nueva → si el
// cargo entró y se perdió la respuesta, se cobra otra vez); equivocarse hacia
// ERROR_TRANSITORIO es un dunning que nunca avanza. Tabla de verdad fijada.

// Los constructores de stripe-node aceptan el error crudo de la API.
const raw = (type: string) => ({ type, message: 'x' });

test('⚠️ tarjeta declinada es un VEREDICTO: el dunning debe avanzar', () => {
  const err = new Stripe.errors.StripeCardError(raw('card_error') as never);
  assert.equal(clasificarErrorCobro(err), 'FALLO_COBRO');
});

test('petición inválida (método borrado, customer inexistente) también es veredicto', () => {
  // Determinista: reintentar sin cambiar nada dará exactamente lo mismo. Si no
  // avanzara el ciclo, el recibo se reintentaría para siempre sin avisar a nadie.
  const err = new Stripe.errors.StripeInvalidRequestError(raw('invalid_request_error') as never);
  assert.equal(clasificarErrorCobro(err), 'FALLO_COBRO');
});

test('⚠️ el caso D-5: corte de red tras crear el PaymentIntent', () => {
  // El cargo pudo hacerse y perderse solo la respuesta. Contarlo como intento
  // estrenaría clave de idempotencia en el siguiente barrido → segundo cargo real.
  const err = new Stripe.errors.StripeConnectionError(raw('api_connection_error') as never);
  assert.equal(clasificarErrorCobro(err), 'ERROR_TRANSITORIO');
});

test('5xx de Stripe: desenlace desconocido, transitorio', () => {
  const err = new Stripe.errors.StripeAPIError(raw('api_error') as never);
  assert.equal(clasificarErrorCobro(err), 'ERROR_TRANSITORIO');
});

test('rate limit sostenido: transitorio (el SDK ya reintentó solo antes de llegar aquí)', () => {
  const err = new Stripe.errors.StripeRateLimitError(raw('rate_limit_error') as never);
  assert.equal(clasificarErrorCobro(err), 'ERROR_TRANSITORIO');
});

test('clave de API mal puesta: transitorio — es fallo nuestro, no de la tarjeta de la socia', () => {
  // Avanzar el dunning aquí acabaría marcando FALLIDO y avisando a la socia de
  // un fallo de pago que nunca ocurrió.
  const err = new Stripe.errors.StripeAuthenticationError(raw('authentication_error') as never);
  assert.equal(clasificarErrorCobro(err), 'ERROR_TRANSITORIO');
});

test('colisión de idempotencia: transitorio (hay otro intento en vuelo con la misma clave)', () => {
  const err = new Stripe.errors.StripeIdempotencyError(raw('idempotency_error') as never);
  assert.equal(clasificarErrorCobro(err), 'ERROR_TRANSITORIO');
});

test('un error que ni siquiera es de Stripe (fetch caído, bug nuestro): transitorio', () => {
  assert.equal(clasificarErrorCobro(new TypeError('fetch failed')), 'ERROR_TRANSITORIO');
  assert.equal(clasificarErrorCobro('cadena rara'), 'ERROR_TRANSITORIO');
  assert.equal(clasificarErrorCobro(undefined), 'ERROR_TRANSITORIO');
});
