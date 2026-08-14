import test from 'node:test';
import assert from 'node:assert/strict';

import { reescribirHtml, reescribirCss } from './reescribir-rutas.ts';

const R2 = 'https://cdn.tentare.app/temas-importados/s1/t1';
const urlDe = (r: string) => (r === 'img/hero.webp' || r === 'styles.css' || r === 'fonts/a.woff2'
  ? `${R2}/${r}` : undefined);

test('reescribirHtml: src y href relativos pasan a la URL absoluta de R2', () => {
  const html = `<img src="img/hero.webp"><link rel="stylesheet" href="styles.css">`;
  const salida = reescribirHtml(html, 'index.html', urlDe);
  assert.ok(salida.includes(`src="${R2}/img/hero.webp"`));
  assert.ok(salida.includes(`href="${R2}/styles.css"`));
});

test('reescribirHtml: comillas simples también', () => {
  const html = `<img src='img/hero.webp'>`;
  assert.ok(reescribirHtml(html, 'index.html', urlDe).includes(`src='${R2}/img/hero.webp'`));
});

test('⚠️ una URL externa (http/https) NO se toca', () => {
  const html = `<img src="https://otra-cdn.com/x.png">`;
  assert.equal(reescribirHtml(html, 'index.html', urlDe), html);
});

test('un anchor (#seccion) no se confunde con una ruta de fichero', () => {
  const html = `<a href="#contacto">Contacto</a>`;
  assert.equal(reescribirHtml(html, 'index.html', urlDe), html);
});

test('una ruta relativa que resuelve fuera del manifest se deja intacta (enlace roto visible, no inventado)', () => {
  const html = `<img src="no-existe.png">`;
  assert.equal(reescribirHtml(html, 'index.html', urlDe), html);
});

test('resuelve la ruta relativa CONTRA la carpeta del propio fichero, no la raíz', () => {
  const html = `<link rel="stylesheet" href="../styles.css">`;
  const salida = reescribirHtml(html, 'paginas/acerca.html', urlDe);
  assert.ok(salida.includes(`href="${R2}/styles.css"`));
});

test('reescribirCss: url() sin comillas y con comillas', () => {
  const css = `.hero { background: url(img/hero.webp); } .h2 { font-family: url('fonts/a.woff2'); }`;
  const salida = reescribirCss(css, 'styles.css', urlDe);
  assert.ok(salida.includes(`url(${R2}/img/hero.webp)`));
  assert.ok(salida.includes(`url('${R2}/fonts/a.woff2')`));
});

test('reescribirCss: un data: URI no se toca', () => {
  const css = `.icon { background: url(data:image/svg+xml;base64,AAAA); }`;
  assert.equal(reescribirCss(css, 'styles.css', urlDe), css);
});
