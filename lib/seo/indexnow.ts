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

// ─── Qué URLs ha cambiado un despliegue ──────────────────────────────────────
// IndexNow es para avisar de lo NUEVO o CAMBIADO. Mandar el sitemap entero en
// cada despliegue (lo que se hacía hasta el 1-oct-2026: 162 URLs × 5 despliegues
// = 810 avisos en 16 horas, casi todos de páginas intactas) es ruido para Bing,
// y el ruido baja la prioridad con la que vuelve a leernos. Se deriva de los
// ficheros que toca el commit; lo que no se sabe a qué página va, avisa de su
// sección entera, nunca del sitio entero.

/** Ficheros de una guía que comparten TODAS las guías (tipos, índice, esquema…). */
const RECURSOS_COMPARTIDOS = /^lib\/recursos\/(articulos\/(index|meta|tipos|util|schema|portadas|proyeccion)\.ts|guias\.ts|schema\.ts)$/;

/**
 * Las URLs del sitemap a las que afecta un cambio en esos ficheros. Un fichero
 * que no se sabe dónde se pinta (el registro de SEO, la guía de Next) devuelve
 * todo el sitemap: es raro y, cuando pasa, de verdad puede haber cambiado
 * cualquier página.
 */
export function urlsAfectadas(ficheros: string[], urlsSitemap: string[]): string[] {
  const enSitemap = new Set(urlsSitemap);
  const ruta = (u: string) => new URL(u).pathname.replace(/\/$/, '') || '/';
  const porRuta = new Map(urlsSitemap.map((u) => [ruta(u), u]));
  const salida = new Set<string>();
  const seccion = (prefijo: string) => {
    for (const [r, u] of porRuta) if (r === prefijo || r.startsWith(`${prefijo}/`)) salida.add(u);
  };

  for (const f of ficheros) {
    if (f === 'lib/seo/paginas.ts') return [...enSitemap];
    if (RECURSOS_COMPARTIDOS.test(f)) { seccion('/recursos'); continue; }
    const guia = f.match(/^lib\/recursos\/articulos\/([a-z0-9-]+)\.ts$/);
    if (guia) {
      if (guia[1].endsWith('.test')) continue;
      const u = porRuta.get(`/recursos/${guia[1]}`);
      if (u) salida.add(u);
      continue;
    }
    const app = f.match(/^app\/(.+)\/[^/]+\.(tsx?|mdx?)$/);
    if (!app) continue;
    // Grupos de rutas `(x)` no son parte de la URL; un segmento dinámico `[x]`
    // corta ahí: avisa de todo lo que cuelga de su padre.
    const partes: string[] = [];
    let dinamica = false;
    for (const s of app[1].split('/')) {
      if (/^\(.*\)$/.test(s)) continue;
      if (/^\[.*\]$/.test(s)) { dinamica = true; break; }
      partes.push(s);
    }
    const r = `/${partes.join('/')}`;
    if (dinamica) seccion(r);
    else if (porRuta.has(r)) salida.add(porRuta.get(r)!);
  }
  return [...salida];
}
