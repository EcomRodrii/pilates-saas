import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esBundleIdValido, esNombreValido, identidadDesde, xcconfigDeIdentidad } from './identidad-app.ts';

test('esBundleIdValido: DNS inverso, como pide Apple', () => {
  assert.equal(esBundleIdValido('app.tentare'), true);
  assert.equal(esBundleIdValido('app.tentare.estudio-luz'), true);
  assert.equal(esBundleIdValido('tentare'), false);
  assert.equal(esBundleIdValido('app..tentare'), false);
  assert.equal(esBundleIdValido('app.tentare.'), false);
  assert.equal(esBundleIdValido('1app.tentare'), false);
  assert.equal(esBundleIdValido('app.tentare_luz'), false);
  assert.equal(esBundleIdValido('app.tentare // x'), false);
});

test('esNombreValido: lo que un xcconfig no puede llevar tal cual, fuera', () => {
  assert.equal(esNombreValido('Tentare'), true);
  assert.equal(esNombreValido('Estudio Luz & Co'), true);
  assert.equal(esNombreValido(''), false);
  assert.equal(esNombreValido(' Tentare'), false);
  assert.equal(esNombreValido('Precio $(HOME)'), false);
  assert.equal(esNombreValido('Mi//Estudio'), false);
  assert.equal(esNombreValido('Dos\nlíneas'), false);
  assert.equal(esNombreValido('x'.repeat(31)), false);
});

test('identidadDesde: dice QUÉ variable arreglar', () => {
  assert.deepEqual(identidadDesde({ appId: 'app.tentare', appName: 'Tentare' }), { bundleId: 'app.tentare', nombre: 'Tentare', equipo: '' });
  assert.throws(() => identidadDesde({ appId: 'tentare', appName: 'Tentare' }), /TENTARE_APP_ID/);
  assert.throws(() => identidadDesde({ appId: 'app.tentare', appName: '' }), /TENTARE_APP_NAME/);
  assert.throws(() => identidadDesde({ appId: 'app.tentare', appName: 'Tentare', equipo: 'abc' }), /TENTARE_APPLE_TEAM_ID/);
  assert.equal(identidadDesde({ appId: 'app.tentare', appName: 'Tentare', equipo: 'AB12CD34EF' }).equipo, 'AB12CD34EF');
});

test('xcconfigDeIdentidad: las tres variables que leen project.pbxproj e Info.plist', () => {
  const x = xcconfigDeIdentidad({ bundleId: 'app.tentare.luz', nombre: 'Luz', equipo: '' });
  assert.match(x, /^TENTARE_BUNDLE_ID = app\.tentare\.luz$/m);
  assert.match(x, /^TENTARE_APP_NAME = Luz$/m);
  assert.match(x, /^TENTARE_TEAM_ID = $/m);
});
