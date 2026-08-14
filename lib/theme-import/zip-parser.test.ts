import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strFromU8 } from 'fflate';

import { descomprimirTema, ZipInvalidoError, LIMITE_ZIP_BYTES } from './zip-parser.ts';

const t = (s: string) => new TextEncoder().encode(s);

test('descomprimirTema: un ZIP estático real, byte a byte idéntico', () => {
  const zip = zipSync({
    'index.html': t('<html><body><img src="hero.webp"></body></html>'),
    'styles.css': t('.hero { color: red; }'),
    'hero.webp': new Uint8Array([1, 2, 3, 4]),
  });
  const { manifest, contenidos } = descomprimirTema(zip);
  assert.deepEqual(manifest.entryPoints, ['index.html']);
  assert.equal(strFromU8(contenidos.get('index.html')!), '<html><body><img src="hero.webp"></body></html>');
  assert.deepEqual([...contenidos.get('hero.webp')!], [1, 2, 3, 4]);
});

test('⚠️ un proyecto exportado con carpeta raíz única se PELA — un solo nivel, no adivinado', () => {
  const zip = zipSync({
    'mi-tema/index.html': t('<html></html>'),
    'mi-tema/styles.css': t('body{}'),
  });
  const { manifest } = descomprimirTema(zip);
  assert.deepEqual(manifest.entryPoints, ['index.html']);
  assert.deepEqual(manifest.stylesheets, ['styles.css']);
});

test('__MACOSX y ficheros ocultos (.DS_Store) no cuentan como contenido del tema', () => {
  const zip = zipSync({
    'index.html': t('<html></html>'),
    '__MACOSX/._index.html': t(''),
    '.DS_Store': t(''),
  });
  const { manifest } = descomprimirTema(zip);
  assert.equal(manifest.ficheros.length, 1);
});

test('un ZIP corrupto da ZipInvalidoError con mensaje para la propietaria, no un stacktrace', () => {
  assert.throws(() => descomprimirTema(t('esto no es un zip')), ZipInvalidoError);
});

test('un ZIP vacío es inválido explícito', () => {
  assert.throws(() => descomprimirTema(zipSync({})), ZipInvalidoError);
});

test('⚠️ por encima del límite de tamaño, se rechaza ANTES de intentar descomprimir', () => {
  const grande = new Uint8Array(LIMITE_ZIP_BYTES + 1);
  assert.throws(() => descomprimirTema(grande), ZipInvalidoError);
});

test('las dependencias de package.json se leen si el ZIP lo trae, y avisan de incompatibilidad', () => {
  const zip = zipSync({
    'index.html': t('<html></html>'),
    'package.json': t(JSON.stringify({ dependencies: { react: '^19', next: '^16' } })),
  });
  const { manifest } = descomprimirTema(zip);
  assert.deepEqual(manifest.dependencias.sort(), ['next', 'react']);
  assert.ok(manifest.incompatibilidades.length > 0);
});

// ── El pipeline entero, de punta a punta (sin R2/DB/HTTP) ───────────────────
//
// ⚠️ Esto NO sustituye probarlo en el navegador con un ZIP real — solo cubre
// lo que se puede probar sin R2/DB/sesión de staff, que es todo lo que este
// entorno de desarrollo permitía verificar. Un HTML que enlaza su propio CSS
// y una imagen, y el CSS referenciando la MISMA imagen otra vez con
// `url(...)`. Prueba que descomprimir + manifest + reescribir encajan juntos,
// no solo cada pieza por separado.
test('el pipeline completo: descomprimir → manifest → reescribir, con una imagen referenciada dos veces', async () => {
  const { reescribirHtml, reescribirCss } = await import('./reescribir-rutas.ts');
  const zip = zipSync({
    'index.html': t(
      '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>' +
      '<body><img src="img/foto.svg"><p class="marca">hola</p></body></html>',
    ),
    'styles.css': t('.marca { background: url(img/foto.svg) no-repeat; }'),
    'img/foto.svg': t('<svg></svg>'),
  });
  const { manifest, contenidos } = descomprimirTema(zip);
  assert.deepEqual(manifest.incompatibilidades, []);

  const R2 = 'https://cdn.example/temas/abc';
  const urlDe = (r: string) => (manifest.ficheros.some((f) => f.ruta === r) ? `${R2}/${r}` : undefined);

  const html = reescribirHtml(strFromU8(contenidos.get('index.html')!), 'index.html', urlDe);
  assert.ok(html.includes(`href="${R2}/styles.css"`));
  assert.ok(html.includes(`src="${R2}/img/foto.svg"`));

  const css = reescribirCss(strFromU8(contenidos.get('styles.css')!), 'styles.css', urlDe);
  assert.ok(css.includes(`url(${R2}/img/foto.svg)`));
});
