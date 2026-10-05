import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Stripe from 'stripe';
import { esErrorDeIdempotencia } from './pago-en-curso.ts';

const raw = (type: string) => ({ type, message: 'x' });

test('reconoce la colisión de idempotencia de Stripe, y solo esa', () => {
  assert.equal(esErrorDeIdempotencia(new Stripe.errors.StripeIdempotencyError(raw('idempotency_error') as never)), true);
  // La forma cruda, por si llega serializado o desde otra copia del SDK.
  assert.equal(esErrorDeIdempotencia({ type: 'StripeIdempotencyError' }), true);
  assert.equal(esErrorDeIdempotencia({ rawType: 'idempotency_error' }), true);
  assert.equal(esErrorDeIdempotencia({ raw: { type: 'idempotency_error' } }), true);

  assert.equal(esErrorDeIdempotencia(new Stripe.errors.StripeCardError(raw('card_error') as never)), false);
  assert.equal(esErrorDeIdempotencia(new Stripe.errors.StripeInvalidRequestError(raw('invalid_request_error') as never)), false);
  assert.equal(esErrorDeIdempotencia(new Stripe.errors.StripeConnectionError(raw('api_connection_error') as never)), false);
  assert.equal(esErrorDeIdempotencia(new Error('fetch failed')), false);
  assert.equal(esErrorDeIdempotencia(null), false);
  assert.equal(esErrorDeIdempotencia(undefined), false);
});

// ── Contrato con las dos puertas que crean un cobro con clave propia ──

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const ruta of ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts']) {
  test(`${ruta}: ante idempotency_error, 409 «pago en curso» SIN soltar la plaza de cupo del cobro vivo`, () => {
    const s = sinComentarios(readFileSync(join(raiz, ruta), 'utf8'));
    const catchFinal = s.slice(s.lastIndexOf('} catch (err) {'));
    const rama = catchFinal.indexOf('if (esErrorDeIdempotencia(err)) {');
    assert.ok(rama > 0, 'el catch del cobro no distingue la colisión de idempotencia');
    const finRama = catchFinal.indexOf('\n    }\n', rama);
    const cuerpo = catchFinal.slice(rama, finRama);
    assert.doesNotMatch(cuerpo, /liberarPlaza\(/, 'la plaza de cupo es la del cobro de antes, que sigue pagable');
    assert.match(cuerpo, /status: 409/);
    assert.match(cuerpo, /codigo: CODIGO_PAGO_EN_CURSO/);
    // La matrícula gratis la reservó ESTA petición para sí sola: esa sí vuelve.
    assert.match(cuerpo, /liberarCupoMatricula\(/);
    assert.ok(rama < catchFinal.indexOf('if (plaza) await liberarPlaza('), 'la rama va antes de soltar nada');
  });
}
