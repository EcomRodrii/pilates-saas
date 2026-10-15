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

test('app de cadena: sus sedes vienen validadas, y una sola sede no es «de cadena»', async () => {
  const { esAppDeEstudio, sedesDeLaApp } = await import('./app-estudio.ts');
  const sede = (slug: string) => ({ slug, nombre: slug, icono: '/i.png', color: null });
  const base = { slug: 'norte', nombre: 'Norte', nombreApp: 'Luz', bundleId: 'app.tentare.cupo-001', icono: '/i.png', color: null };
  assert.equal(esAppDeEstudio(base), true);
  assert.equal(esAppDeEstudio({ ...base, sedes: [sede('norte'), sede('sur')] }), true);
  assert.equal(esAppDeEstudio({ ...base, sedes: [sede('norte'), { slug: 'p*', nombre: 'x', icono: '', color: null }] }), false);
  assert.equal(esAppDeEstudio({ ...base, sedes: 'norte' }), false);
  assert.equal(sedesDeLaApp({ ...base, sedes: [sede('norte')] }), null);
  assert.equal(sedesDeLaApp(null), null);
  assert.equal(sedesDeLaApp({ ...base, sedes: [sede('norte'), sede('sur')] })?.length, 2);
});

test('app de cadena: a qué sede entra la alumna', async () => {
  const { entradaEnCadena } = await import('./app-estudio.ts');
  const sedes = ['norte', 'sur', 'centro'].map((slug) => ({ slug, nombre: slug, icono: '', color: null }));
  const sin = { ultimo: null, pideLista: false, enlace: null };
  // Solo es de una: directa.
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur', 'otro-estudio']), sin), { tipo: 'ir', slug: 'sur' });
  // De varias: la última que abrió; sin última, elige.
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur', 'norte']), { ...sin, ultimo: 'norte' }), { tipo: 'ir', slug: 'norte' });
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur', 'norte']), sin), { tipo: 'elegir' });
  // La última de OTRO estudio no cuenta.
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur', 'norte']), { ...sin, ultimo: 'otro-estudio' }), { tipo: 'elegir' });
  // De ninguna: elige dónde darse de alta.
  assert.deepEqual(entradaEnCadena(sedes, new Set(), sin), { tipo: 'elegir' });
  // «Cambiar de sede»: la lista siempre.
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur']), { ...sin, pideLista: true }), { tipo: 'elegir' });
  // Un enlace a una sede de la cadena: a ella (o a darse de alta); a otra que no es de la cadena, se ignora.
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur']), { ...sin, enlace: 'centro' }), { tipo: 'alta', slug: 'centro' });
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur']), { ...sin, enlace: 'sur', pideLista: true }), { tipo: 'ir', slug: 'sur' });
  assert.deepEqual(entradaEnCadena(sedes, new Set(['sur']), { ...sin, enlace: 'competencia' }), { tipo: 'ir', slug: 'sur' });
});
