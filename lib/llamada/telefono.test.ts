import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefono, formatearNacional, mostrarE164, enmascarar, soloCifras } from './telefono.ts';

test('un móvil español, escrito como cada cual lo escribe, sale igual', () => {
  for (const n of ['612345678', '612 34 56 78', '612-345-678', '(612) 345 678']) {
    const r = normalizarTelefono('34', n);
    assert.deepEqual(r, { ok: true, e164: '+34612345678', nacional: '612345678' });
  }
});

test('quien pega el número con el prefijo no tiene que quitarlo', () => {
  assert.equal(normalizarTelefono('34', '+34 612 34 56 78').ok, true);
  assert.equal(normalizarTelefono('34', '0034612345678').ok, true);
});

test('un prefijo pegado que no es el del país elegido se rechaza, no se adivina', () => {
  const r = normalizarTelefono('34', '+351 912 345 678');
  assert.equal(r.ok, false);
});

test('España: 9 cifras y empieza por 6-9', () => {
  assert.equal(normalizarTelefono('34', '512345678').ok, false);
  assert.equal(normalizarTelefono('34', '61234567').ok, false);
  assert.equal(normalizarTelefono('34', '6123456789').ok, false);
  assert.equal(normalizarTelefono('34', '').ok, false);
  assert.equal(normalizarTelefono('34', 'abc').ok, false);
});

test('otro país: rango de cifras, y un prefijo desconocido no pasa', () => {
  assert.equal(normalizarTelefono('52', '5512345678').ok, true);
  assert.equal(normalizarTelefono('52', '551234').ok, false);
  assert.equal(normalizarTelefono('999', '612345678').ok, false);
  assert.equal(normalizarTelefono('', '612345678').ok, false);
});

test('formato mientras se escribe y para enseñarlo', () => {
  assert.equal(formatearNacional('34', '612345678'), '612 34 56 78');
  assert.equal(formatearNacional('34', '6123'), '612 3');
  assert.equal(mostrarE164('+34612345678'), '+34 612 34 56 78');
  assert.equal(soloCifras('+34 6-12'), '34612');
});

test('la máscara no enseña el número entero', () => {
  const m = enmascarar('+34612345678');
  assert.ok(!m.includes('612345'));
});
