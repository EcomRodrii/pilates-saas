import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esNativoSegun, hojaDeCalendarioSinPermiso, plataformaSegun, versionIosSegun } from './plataforma.ts';

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

const UA_IOS = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;

test('versionIosSegun: la mayor del user agent del iPhone/iPad; null fuera', () => {
  assert.equal(versionIosSegun(UA_IOS('17_5')), 17);
  assert.equal(versionIosSegun(UA_IOS('16_6_1')), 16);
  assert.equal(versionIosSegun('Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15'), 15);
  assert.equal(versionIosSegun('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), null);
  assert.equal(versionIosSegun('Mozilla/5.0 (Linux; Android 14)'), null);
});

test('hojaDeCalendarioSinPermiso: solo desde iOS 17', () => {
  assert.equal(hojaDeCalendarioSinPermiso(UA_IOS('17_0')), true);
  assert.equal(hojaDeCalendarioSinPermiso(UA_IOS('18_1')), true);
  assert.equal(hojaDeCalendarioSinPermiso(UA_IOS('16_7')), false);
  assert.equal(hojaDeCalendarioSinPermiso(UA_IOS('15_0')), false);
  assert.equal(hojaDeCalendarioSinPermiso(''), false);
});
