import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEXNOW_CLAVE, INDEXNOW_HOST, cuerpoIndexNow, urlsDelSitemap } from './indexnow.ts';

const RAIZ = join(import.meta.dirname, '..', '..');

test('la clave cumple el formato de IndexNow y su fichero la contiene tal cual', () => {
  assert.match(INDEXNOW_CLAVE, /^[a-zA-Z0-9-]{8,128}$/);
  // Si alguien cambia la clave sin mover el fichero, Bing responde 403 y nadie se entera.
  assert.equal(readFileSync(join(RAIZ, 'public', `${INDEXNOW_CLAVE}.txt`), 'utf8'), INDEXNOW_CLAVE);
});

test('del sitemap solo salen URLs de nuestro host, sin repetir', () => {
  const xml = `<urlset>
    <url><loc>https://${INDEXNOW_HOST}/</loc></url>
    <url><loc> https://${INDEXNOW_HOST}/precios </loc></url>
    <url><loc>https://${INDEXNOW_HOST}/precios</loc></url>
    <url><loc>https://otro.example.com/x</loc></url>
  </urlset>`;
  assert.deepEqual(urlsDelSitemap(xml), [`https://${INDEXNOW_HOST}/`, `https://${INDEXNOW_HOST}/precios`]);
});

test('el cuerpo lleva host, clave y dónde está la clave', () => {
  const c = cuerpoIndexNow([`https://${INDEXNOW_HOST}/`]);
  assert.equal(c.host, INDEXNOW_HOST);
  assert.equal(c.keyLocation, `https://${INDEXNOW_HOST}/${INDEXNOW_CLAVE}.txt`);
  assert.deepEqual(c.urlList, [`https://${INDEXNOW_HOST}/`]);
});
