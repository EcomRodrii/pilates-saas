#!/usr/bin/env node
// Avisa por IndexNow de las URLs del sitemap de PRODUCCIÓN (ver lib/seo/indexnow.ts).
//
//   node --experimental-strip-types scripts/indexnow.mjs                 → todas las del sitemap
//   node --experimental-strip-types scripts/indexnow.mjs /precios /recursos/x → solo esas rutas
//   INDEXNOW_SECO=1 …                                                     → enseña lo que mandaría
//
// Lo lanza .github/workflows/indexnow.yml cuando cambia contenido público y
// Vercel ya ha desplegado ese commit: avisar antes de tiempo hace que el
// buscador lea la versión vieja.
import { INDEXNOW_ENDPOINT, INDEXNOW_HOST, cuerpoIndexNow, urlsDelSitemap } from '../lib/seo/indexnow.ts';

const rutas = process.argv.slice(2);
let urls;
if (rutas.length > 0) {
  urls = rutas.map((r) => new URL(r, `https://${INDEXNOW_HOST}`).toString());
} else {
  const res = await fetch(`https://${INDEXNOW_HOST}/sitemap.xml`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`sitemap.xml respondió ${res.status}`);
  urls = urlsDelSitemap(await res.text());
}
if (urls.length === 0) throw new Error('No hay ninguna URL que avisar');

const cuerpo = cuerpoIndexNow(urls);
if (process.env.INDEXNOW_SECO) {
  console.log(JSON.stringify({ ...cuerpo, urlList: `${cuerpo.urlList.length} URLs` }, null, 2));
  process.exit(0);
}
const res = await fetch(INDEXNOW_ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(cuerpo),
});
// 200 = recibido; 202 = recibido, la clave se comprueba después. Lo demás es un
// fallo real (400 formato, 403 clave, 422 URL de otro host, 429 demasiados avisos).
console.log(`IndexNow: ${res.status} ${res.statusText} · ${cuerpo.urlList.length} URLs`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
