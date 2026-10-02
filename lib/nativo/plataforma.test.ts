import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esNativoSegun, plataformaSegun } from './plataforma.ts';

test('esNativoSegun: solo el puente nativo de verdad dice que sí', () => {
  assert.equal(esNativoSegun({ isNativePlatform: () => true, getPlatform: () => 'ios' }), true);
  // El `Capacitor` que crea `@capacitor/core` en la web.
  assert.equal(esNativoSegun({ isNativePlatform: () => false, getPlatform: () => 'web' }), false);
  assert.equal(esNativoSegun(undefined), false);
  assert.equal(esNativoSegun(null), false);
  assert.equal(esNativoSegun({}), false);
  assert.equal(esNativoSegun({ isNativePlatform: true }), false);
  assert.equal(esNativoSegun({ isNativePlatform: () => 'true' }), false);
  assert.equal(esNativoSegun({ isNativePlatform: () => { throw new Error('x'); } }), false);
});

test('plataformaSegun: ios/android dentro de la app, null fuera', () => {
  assert.equal(plataformaSegun({ isNativePlatform: () => true, getPlatform: () => 'ios' }), 'ios');
  assert.equal(plataformaSegun({ isNativePlatform: () => true, getPlatform: () => 'android' }), 'android');
  assert.equal(plataformaSegun({ isNativePlatform: () => false, getPlatform: () => 'web' }), null);
  assert.equal(plataformaSegun({ isNativePlatform: () => true, getPlatform: () => 'otra' }), null);
});
