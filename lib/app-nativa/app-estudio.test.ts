import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE_TENTARE, esAppDeEstudio, esBundleDeEstudio, tipoDeApp } from './app-estudio.ts';

test('la web y la app «Tentare» no son una app de estudio', () => {
  assert.equal(tipoDeApp(null), 'general');
  assert.equal(tipoDeApp(undefined), 'general');
  assert.equal(tipoDeApp(BUNDLE_TENTARE), 'general');
});

test('un bundle con el formato de Apple, en minúsculas, sí lo es', () => {
  assert.equal(tipoDeApp('app.tentare.luz'), 'estudio');
  assert.equal(tipoDeApp('es.zen-pilates.app'), 'estudio');
});

test('lo que no tiene ese formato no abre ningún estudio', () => {
  for (const malo of ['', 'luz', 'App.Tentare.Luz', '.app', 'app..luz', 'app.tentare.', 'a b.c', '1app.luz', 'x'.repeat(160) + '.es']) {
    assert.equal(esBundleDeEstudio(malo), false, malo);
  }
  assert.equal(esBundleDeEstudio(42), false);
});

test('la respuesta del servidor se comprueba antes de fiarse', () => {
  const ok = { slug: 'luz-pilates', nombre: 'Luz', nombreApp: 'Luz', bundleId: 'app.tentare.luz', icono: '/icono-estudio?x=1', color: '#112233' };
  assert.equal(esAppDeEstudio(ok), true);
  assert.equal(esAppDeEstudio({ ...ok, color: null }), true);
  for (const malo of [null, {}, { ...ok, slug: '../x' }, { ...ok, nombre: '' }, { ...ok, icono: 3 }, { ...ok, color: 5 }]) {
    assert.equal(esAppDeEstudio(malo), false);
  }
});
