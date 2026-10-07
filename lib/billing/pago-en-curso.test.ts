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
  test(`${ruta}: ante idempotency_error, 409 «pago en curso» y la plaza de cupo solo si no es de ningún cobro`, () => {
    const s = sinComentarios(readFileSync(join(raiz, ruta), 'utf8'));
    const catchFinal = s.slice(s.lastIndexOf('} catch (err) {'));
    const rama = catchFinal.indexOf('if (esErrorDeIdempotencia(err)) {');
    assert.ok(rama > 0, 'el catch del cobro no distingue la colisión de idempotencia');
    const finRama = catchFinal.indexOf('\n    }\n', rama);
    const cuerpo = catchFinal.slice(rama, finRama);
    // La plaza puede ser la del cobro de antes (misma clave), que sigue pagable: nunca
    // a ciegas. Solo si ningún cobro la tiene ligada (revisión del 5-oct, #4: si la
    // etapa empezó entre las dos peticiones, el cobro de antes no la lleva).
    assert.doesNotMatch(cuerpo, /liberarPlaza\(/, 'la plaza de cupo puede ser la del cobro de antes');
    assert.match(cuerpo, /if \(plaza\) await liberarPlazaSinCobro\(admin, plaza\.id\);/);
    assert.match(cuerpo, /status: 409/);
    assert.match(cuerpo, /codigo: CODIGO_PAGO_EN_CURSO/);
    // La matrícula gratis la reservó ESTA petición para sí sola: esa sí vuelve.
    assert.match(cuerpo, /liberarCupoMatricula\(|devolverMatriculaPropia\(\)/);
  });
}

// ── 7-oct-2026: el texto dice la verdad de lo que se paga ──────────────────
import { mensajePagoEnCurso } from './pago-en-curso.ts';

test('pagar un recibo: ni matrícula ni «reservar», y reintentar en un minuto (su clave lleva el minuto)', () => {
  const m = mensajePagoEnCurso('recibo');
  assert.match(m, /recibo/);
  assert.doesNotMatch(m, /matr[ií]cula|reservar/i);
  assert.match(m, /dentro de un minuto/);
  assert.match(m, /no se te ha cobrado nada/);
});

test('una compra suelta reintenta en un minuto; una clase concreta (clave sin tiempo) va al estudio', () => {
  assert.match(mensajePagoEnCurso('compra'), /dentro de un minuto/);
  assert.doesNotMatch(mensajePagoEnCurso('clase'), /dentro de un minuto/);
  assert.match(mensajePagoEnCurso('clase'), /escribe al estudio y te ayudará a reservar/);
  for (const q of ['recibo', 'compra', 'clase'] as const) assert.match(mensajePagoEnCurso(q), /no se te ha cobrado nada/);
});

test('cada ruta elige el texto por lo que se paga', () => {
  const checkout = sinComentarios(readFileSync(join(raiz, 'app/api/stripe/checkout/route.ts'), 'utf8'));
  assert.match(checkout, /const que = body\.reciboId \? 'recibo' : body\.sesionId \? 'clase' : 'compra';\s*return conCorsWidget\(req, NextResponse\.json\(\{ error: mensajePagoEnCurso\(que\)/);
  const embebido = sinComentarios(readFileSync(join(raiz, 'app/api/public/checkout-embebido/route.ts'), 'utf8'));
  // Con fila de `pagos_clase` la clave es la de la fila, que se cierra en este 409: reintentar
  // abre otra, así que no se manda a nadie al estudio sin necesidad.
  assert.match(embebido, /error: mensajePagoEnCurso\(body\.sesionId && !pagoClase \? 'clase' : 'compra'\)/);
});
