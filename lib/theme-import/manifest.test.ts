import test from 'node:test';
import assert from 'node:assert/strict';

import { clasificarFichero, construirManifest, type FicheroImportado } from './manifest.ts';

const f = (ruta: string, bytes = 100): FicheroImportado => ({ ruta, clase: clasificarFichero(ruta), bytes });

test('clasificarFichero: por extensión, sin mirar contenido', () => {
  assert.equal(clasificarFichero('index.html'), 'html');
  assert.equal(clasificarFichero('styles/main.css'), 'css');
  assert.equal(clasificarFichero('img/hero.WEBP'), 'imagen'); // mayúsculas
  assert.equal(clasificarFichero('fonts/inter.woff2'), 'fuente');
  assert.equal(clasificarFichero('components/Hero.tsx'), 'typescript');
  assert.equal(clasificarFichero('script.js'), 'javascript');
  assert.equal(clasificarFichero('package.json'), 'config');
  assert.equal(clasificarFichero('README'), 'otro');
});

test('construirManifest: un ZIP estático (HTML+CSS+assets) sin incompatibilidades', () => {
  const m = construirManifest([
    f('index.html'), f('styles.css'), f('img/hero.webp'), f('fonts/a.woff2'),
  ]);
  assert.equal(m.framework, 'estatico');
  assert.deepEqual(m.entryPoints, ['index.html']);
  assert.deepEqual(m.stylesheets, ['styles.css']);
  assert.deepEqual(m.assets, ['img/hero.webp']);
  assert.deepEqual(m.fonts, ['fonts/a.woff2']);
  assert.deepEqual(m.incompatibilidades, []);
});

test('⚠️ un ZIP con .tsx sin compilar es INCOMPATIBLE explícito, no se aproxima', () => {
  const m = construirManifest([f('index.html'), f('components/Hero.tsx')]);
  assert.ok(m.incompatibilidades.length > 0);
  assert.match(m.incompatibilidades[0], /tsx|jsx/i);
});

test('⚠️ un proyecto Next.js se marca incompatible con next.config.js presente', () => {
  const m = construirManifest([f('next.config.js'), f('app/page.tsx')]);
  assert.equal(m.framework, 'next');
  assert.ok(m.incompatibilidades.some((i) => /Next\.js/.test(i)));
});

test('⚠️ un ZIP sin ningún HTML es incompatible: no hay página que servir', () => {
  const m = construirManifest([f('styles.css')]);
  assert.ok(m.incompatibilidades.some((i) => /\.html/.test(i)));
});

test('el entry point es SIEMPRE index.html si existe, aunque no sea el primero', () => {
  const m = construirManifest([f('acerca.html'), f('index.html'), f('contacto.html')]);
  assert.equal(m.entryPoints[0], 'index.html');
});

test('dependencias de package.json se listan y AVISAN, no se instalan', () => {
  const m = construirManifest([f('index.html')], ['react', 'next']);
  assert.deepEqual(m.dependencias, ['react', 'next']);
  assert.ok(m.incompatibilidades.some((i) => /dependencia/.test(i)));
});
