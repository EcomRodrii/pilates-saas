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

const H = `https://${INDEXNOW_HOST}`;
const SITEMAP = ['/', '/precios', '/recursos', '/recursos/bsport-vs-timp', '/recursos/precio-clase-de-pilates',
  '/comparativa', '/comparativa/tentare-vs-lorari', '/funcionalidades/facturacion'].map((r) => `${H}${r === '/' ? '/' : r}`);

test('una guía cambiada avisa solo de esa guía', async () => {
  const { urlsAfectadas } = await import('./indexnow.ts');
  assert.deepEqual(urlsAfectadas(['lib/recursos/articulos/bsport-vs-timp.ts'], SITEMAP), [`${H}/recursos/bsport-vs-timp`]);
  assert.deepEqual(urlsAfectadas(['lib/recursos/articulos/articulos.test.ts'], SITEMAP), []);
});

test('una página de app/ avisa de su ruta, sin grupos de rutas', async () => {
  const { urlsAfectadas } = await import('./indexnow.ts');
  assert.deepEqual(urlsAfectadas(['app/comparativa/tentare-vs-lorari/page.tsx'], SITEMAP), [`${H}/comparativa/tentare-vs-lorari`]);
  assert.deepEqual(urlsAfectadas(['app/(marketing)/precios/page.tsx'], SITEMAP), [`${H}/precios`]);
});

test('un segmento dinámico o un fichero compartido avisa de su sección, no del sitio', async () => {
  const { urlsAfectadas } = await import('./indexnow.ts');
  const recursos = [`${H}/recursos`, `${H}/recursos/bsport-vs-timp`, `${H}/recursos/precio-clase-de-pilates`];
  assert.deepEqual(urlsAfectadas(['app/recursos/[slug]/page.tsx'], SITEMAP).sort(), recursos.sort());
  assert.deepEqual(urlsAfectadas(['lib/recursos/articulos/tipos.ts'], SITEMAP).sort(), recursos.sort());
});

test('el registro de SEO puede cambiar cualquier página: avisa de todas', async () => {
  const { urlsAfectadas } = await import('./indexnow.ts');
  assert.equal(urlsAfectadas(['lib/seo/paginas.ts'], SITEMAP).length, SITEMAP.length);
});

test('lo que no es una página pública no avisa de nada', async () => {
  const { urlsAfectadas } = await import('./indexnow.ts');
  assert.deepEqual(urlsAfectadas(['app/(dashboard)/clientas/page.tsx', 'lib/billing/x.ts', 'app/api/x/route.ts'], SITEMAP), []);
});
