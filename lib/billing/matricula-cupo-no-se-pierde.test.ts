import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Las plazas de «matrícula gratis para las N primeras» no pueden gastarse sin
// una venta. Los dos checkouts las reservan ANTES de crear el cobro, así que
// todo camino que no acabe en un cobro NUEVO tiene que devolverla.
//
// Sobre el fuente, como el resto de guardianes de estas rutas: montar Stripe y
// la base para cada `return` no es viable, y el fallo es siempre el mismo —
// un camino que se olvida de devolver.
// ─────────────────────────────────────────────────────────────────────────────

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('⚠️ checkout embebido: si Stripe repite el PaymentIntent del mismo intento, la plaza de esta petición vuelve', () => {
  const src = fuente('../../app/api/public/checkout-embebido/route.ts');
  assert.match(src, /if \(cupoMatriculaReservado && esRespuestaRepetida\(paymentIntent\)\) \{\s*await liberarCupoMatricula\(/,
    'dos peticiones del mismo intento reservan dos plazas y Stripe crea UN cobro: la segunda tiene que devolverse');
  assert.ok(src.indexOf('esRespuestaRepetida(paymentIntent)') > src.indexOf('stripe.paymentIntents.create('),
    'la comprobación tiene que ir DESPUÉS de crear el cobro');
});

test('⚠️ Checkout Session: si Stripe repite la sesión del mismo intento, la plaza de esta petición vuelve', () => {
  const src = fuente('../../app/api/stripe/checkout/route.ts');
  assert.match(src, /if \(cupoMatriculaReservado && esRespuestaRepetida\(session\)\) \{\s*await liberarCupoMatricula\(/);
  assert.ok(src.indexOf('esRespuestaRepetida(session)') > src.indexOf('stripe.checkout.sessions.create('));
});

test('⚠️ Checkout Session: Bizum no activo corta la compra DESPUÉS de reservar — tiene que devolverla', () => {
  const src = fuente('../../app/api/stripe/checkout/route.ts');
  const i = src.indexOf('if (conBizum && !(await bizumActivo(');
  assert.notEqual(i, -1);
  const bloque = src.slice(i, src.indexOf('return conCorsWidget', i));
  assert.match(bloque, /liberarCupoMatricula\(/, 'el 409 de Bizum no activo se queda con la plaza');
});
