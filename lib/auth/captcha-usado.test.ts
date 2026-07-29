import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alGastarCaptcha, captchaGastado } from './captcha-usado.ts';

test('avisa a quien esté suscrito', () => {
  let veces = 0;
  const baja = alGastarCaptcha(() => { veces++; });
  captchaGastado();
  captchaGastado();
  assert.equal(veces, 2, 'cada llamada de auth con token refresca el widget');
  baja();
});

test('darse de baja de verdad da de baja', () => {
  // Si no, un widget desmontado seguiría recibiendo avisos y llamaría a
  // `turnstile.reset` sobre un id que ya no existe.
  let veces = 0;
  const baja = alGastarCaptcha(() => { veces++; });
  baja();
  captchaGastado();
  assert.equal(veces, 0);
});

test('con varios widgets a la vez, se refrescan todos', () => {
  // Pasa de verdad: /reservar pinta el suyo y el formulario de login del portal
  // puede estar montado a la vez en la misma página.
  const vistos: string[] = [];
  const b1 = alGastarCaptcha(() => vistos.push('a'));
  const b2 = alGastarCaptcha(() => vistos.push('b'));
  captchaGastado();
  assert.deepEqual(vistos.sort(), ['a', 'b']);
  b1(); b2();
});

test('sin nadie suscrito no revienta', () => {
  // La capa de auth avisa siempre que manda un token, y hay pantallas que
  // llaman sin tener widget montado (crons, tests, portal sin captcha).
  assert.doesNotThrow(() => captchaGastado());
});

test('darse de baja dos veces tampoco revienta', () => {
  const baja = alGastarCaptcha(() => {});
  baja();
  assert.doesNotThrow(() => baja());
});
