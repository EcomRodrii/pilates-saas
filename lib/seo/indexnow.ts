// ─────────────────────────────────────────────────────────────────────────────
// IndexNow: el aviso con el que Bing (y con él la búsqueda de ChatGPT y de
// Copilot), Yandex, Seznam y Naver se enteran de una URL nueva o cambiada sin
// esperar a volver a leer el sitemap. Protocolo: https://www.indexnow.org
//
// La clave es PÚBLICA por diseño: el buscador la comprueba leyendo
// /<clave>.txt en la raíz del dominio (fichero de public/). No es un secreto y
// no da acceso a nada; solo prueba que quien avisa controla el dominio.
//
// Sin alias `@/`: lo importan scripts/indexnow.mjs y node --test.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../legal-info.ts';

export const INDEXNOW_CLAVE = '00950545e7f373038c379be320899d36';
/** El host de producción, sacado del origen único (lib/legal-info.ts). */
export const INDEXNOW_HOST = new URL(LEGAL.url).host;
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Hasta 10.000 URLs por aviso, según el protocolo. */
export const INDEXNOW_MAX_URLS = 10_000;

/** Las URLs de un sitemap XML que son de nuestro host, sin repetir. */
export function urlsDelSitemap(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls.filter((u) => new URL(u).host === INDEXNOW_HOST))];
}

/** El cuerpo del aviso, tal como lo pide el protocolo. */
export function cuerpoIndexNow(urls: string[]) {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_CLAVE,
    keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_CLAVE}.txt`,
    urlList: urls.slice(0, INDEXNOW_MAX_URLS),
  };
}
