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
  // `creadoAqui` = no es la repetición de otra petición (o lo es de un cobro
  // cancelado y esta petición creó otro, que se queda con la plaza).
  assert.match(src, /if \(!esRespuestaRepetida\(pi\)\) \{ paymentIntent = pi; creadoAqui = true; break; \}/);
  assert.match(src, /if \(!creadoAqui\) await devolverMatriculaPropia\(\);/,
    'dos peticiones del mismo intento reservan dos plazas y Stripe crea UN cobro: la segunda tiene que devolverse');
  assert.match(src, /const devolverMatriculaPropia = async \(\) => \{\s*if \(cupoMatriculaReservado\) await liberarCupoMatricula\(/);
  assert.ok(src.indexOf('esRespuestaRepetida(pi)') > src.indexOf('stripe.paymentIntents.create('),
    'la comprobación tiene que ir DESPUÉS de crear el cobro');
});

// Revisión del 5-oct (#6): si el cobro YA existe con la marca y la ruta lo cancela
// (no se pudieron escribir sus datos, o no se pudo ligar la plaza), la plaza vuelve
// con la clave de ESE cobro: el conciliador lo vería cancelado con la marca y la
// devolvería otra vez. Sin clave era −1 neto por petición y la promoción no se agotaba.
test('⚠️ un cobro que ya existe con la marca y se cancela aquí devuelve la matrícula «una vez», con SU clave', () => {
  const emb = fuente('../../app/api/public/checkout-embebido/route.ts');
  assert.match(emb, /const devolverMatriculaDe = async \(cobroId: string\) => \{[\s\S]*?liberarCupoMatriculaUnaVez\(admin, cobroId,/);
  const sinDatos = emb.slice(emb.indexOf('sin-datos-cancelar-'), emb.indexOf("errorInterno('public/checkout-embebido:datos'"));
  assert.match(sinDatos, /await devolverMatriculaDe\(paymentIntent\.id\);/);
  assert.doesNotMatch(sinDatos, /liberarCupoMatricula\(admin/);
  const sinPlaza = emb.slice(emb.indexOf('plaza-cancelar-${paymentIntent.id}'), emb.indexOf("'No se pudo iniciar el cobro. Inténtalo de nuevo.' }, { status: 500 }"));
  assert.match(sinPlaza, /if \(cancelado\) \{[\s\S]*?await devolverMatriculaDe\(paymentIntent\.id\);/);

  const hosp = fuente('../../app/api/stripe/checkout/route.ts');
  assert.match(hosp, /const devolverMatriculaDeSesion = async \(sessionId: string\) => \{[\s\S]*?liberarCupoMatriculaUnaVez\(admin, sessionId,/);
  const sinDatosA = hosp.slice(hosp.indexOf('checkout.sessions.update(session.id'), hosp.indexOf("errorInterno('stripe/checkout:datos'"));
  assert.match(sinDatosA, /if \(e\.status === 'expired'\) \{[\s\S]*?await devolverMatriculaDeSesion\(session\.id\);/);
  assert.doesNotMatch(sinDatosA, /liberarCupoMatricula\(admin/);
});

test('⚠️ Checkout Session: si Stripe repite la sesión del mismo intento, la plaza de esta petición vuelve', () => {
  const src = fuente('../../app/api/stripe/checkout/route.ts');
  // `creadaAqui` = no es la repetición de otra petición (o lo es de una caducada y
  // esta petición creó otra, que se queda con la plaza).
  assert.match(src, /let creadaAqui = !esRespuestaRepetida\(session\);/);
  assert.match(src, /if \(cupoMatriculaReservado && !creadaAqui\) \{\s*await liberarCupoMatricula\(/);
  assert.ok(src.indexOf('esRespuestaRepetida(session)') > src.indexOf('stripe.checkout.sessions.create('));
});

test('⚠️ Checkout Session: Bizum no activo corta la compra DESPUÉS de reservar — tiene que devolverla', () => {
  const src = fuente('../../app/api/stripe/checkout/route.ts');
  const i = src.indexOf('if (conBizum && !(await bizumActivo(');
  assert.notEqual(i, -1);
  const bloque = src.slice(i, src.indexOf('return conCorsWidget', i));
  assert.match(bloque, /liberarCupoMatricula\(/, 'el 409 de Bizum no activo se queda con la plaza');
});
