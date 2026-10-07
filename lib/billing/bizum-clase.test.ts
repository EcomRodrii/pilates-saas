import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caducidadCheckoutDeClase, MARGEN_CREACION_MS, MINIMO_CHECKOUT_MS } from './bizum-clase.ts';

const AHORA = Date.UTC(2026, 9, 6, 8, 0, 0);
const en = (min: number) => new Date(AHORA + min * 60_000);

test('caduca cuando se cierra la reserva de la clase, sale de la clase y no del reloj', () => {
  const cierre = en(120);
  const a = caducidadCheckoutDeClase(cierre, AHORA);
  const b = caducidadCheckoutDeClase(cierre, AHORA + 5 * 60_000);
  assert.deepEqual(a, { ok: true, expiresAt: Math.floor(cierre.getTime() / 1000) });
  assert.deepEqual(a, b, 'dos peticiones del mismo intento mandan el mismo expires_at');
});

test('con menos de 30 min hasta el cierre no se ofrece Bizum (y se dice que no se ha cobrado nada)', () => {
  const r = caducidadCheckoutDeClase(en(29), AHORA);
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /No te hemos cobrado nada/);
  // Los 30 min de Stripe cuentan desde que CREA la sesión, que llega después de mirar el reloj.
  assert.equal(caducidadCheckoutDeClase(new Date(AHORA + MINIMO_CHECKOUT_MS), AHORA).ok, false, 'justo 30 min, no: Stripe la crea después y quedaría por debajo');
  assert.equal(caducidadCheckoutDeClase(new Date(AHORA + MINIMO_CHECKOUT_MS + MARGEN_CREACION_MS - 1), AHORA).ok, false);
  assert.equal(caducidadCheckoutDeClase(new Date(AHORA + MINIMO_CHECKOUT_MS + MARGEN_CREACION_MS), AHORA).ok, true, 'con el margen, sí');
  assert.equal(caducidadCheckoutDeClase(en(-10), AHORA).ok, false, 'ya cerrada');
});

test('con más de 24 h, la de siempre: ya acaba antes del cierre', () => {
  assert.deepEqual(caducidadCheckoutDeClase(en(25 * 60), AHORA), { ok: true, expiresAt: null });
});

test('con plaza de etapa, su caducidad (que manda sobre la del cierre) nunca deja pagar después de cerrar la reserva', async () => {
  // Con plaza, la sesión caduca con la plaza (MINUTOS_RESERVA), no con el cierre de la clase. Solo
  // se ofrece Bizum si el cierre queda a ≥ MINIMO + MARGEN: la plaza tiene que caducar antes.
  const { MINUTOS_RESERVA } = await import('../opening/cupo.ts');
  assert.ok(MINUTOS_RESERVA * 60_000 < MINIMO_CHECKOUT_MS + MARGEN_CREACION_MS);
});
