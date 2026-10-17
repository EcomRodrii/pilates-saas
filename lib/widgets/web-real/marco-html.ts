// El documento que enseña la web REAL de un estudio dentro de la vista previa de
// «Tu web» v2 (lo sirve /vista-previa-web) y la política de seguridad con la que
// se sirve. Puro, para `node --test`.
//
// Por qué un documento aparte y no el iframe directo en el panel: el panel no
// puede dar una lista de `frame-src` propia sin saber qué estudio mira (la sesión
// va en el navegador, no en una cookie que el servidor lea al servir la página) y,
// puesta a ciegas en una pantalla tan grande como Configuración, se llevaría por
// delante lo que otras pestañas enmarcan. Aquí la lista la fija el SERVIDOR para
// esta petición, con el origen autorizado del estudio de la sesión, y se queda
// en el documento que lo enmarca: el resto del panel no cambia ni una cabecera.
//
// ⚠️ Solo `frame-src` y `frame-ancestors`. Una `Content-Security-Policy` sin
// `default-src` no restringe nada más, y añadir más directivas a este documento
// (que no ejecuta nada nuestro) solo arriesgaría romper lo que no hace falta.

import { variantesDeHost } from './decision.ts';

/** Los orígenes que el marco puede enmarcar: el autorizado y su forma con/sin `www.` (el mismo sitio). */
export function origenesDelMarco(origen: string): string[] {
  const u = new URL(origen);
  return variantesDeHost(u.hostname).map(h => `https://${h}`);
}

/** La política del documento: SOLO puede enmarcar la web del estudio, y solo lo enmarca nuestro propio origen. */
export function politicaDelMarco(origen: string): string {
  return `frame-src ${origenesDelMarco(origen).join(' ')}; frame-ancestors 'self'`;
}

/** Las cabeceras de la respuesta (el proxy no las pone aquí: esta ruta queda fuera de su `matcher`, como tema-publicado). */
export function cabecerasDelMarco(origen: string): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': politicaDelMarco(origen),
    // Los navegadores sin `frame-ancestors`: el mismo origen, y nadie más.
    'X-Frame-Options': 'SAMEORIGIN',
    // La dirección de esta página lleva el permiso firmado: no viaja a nadie.
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  };
}

/** Lo justo para meter un valor entre comillas en un atributo HTML. */
const aAtributo = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Los permisos del iframe de su web, con el porqué de cada uno (y de los que NO lleva). */
export const SANDBOX_DE_SU_WEB = 'allow-scripts';

export const TITULO_DE_SU_WEB = 'Tu web, tal como se ve ahora (orientativo)';

/**
 * El documento: su web a pantalla completa en un iframe, y nada más. No se
 * descarga ni se reescribe ni se inyecta nada en ella: el navegador de quien mira
 * la pide a su servidor, como a cualquier visitante.
 *
 * `sandbox="allow-scripts"` y nada más:
 *  · allow-scripts: sin él, las webs que se pintan con JavaScript (casi todas)
 *    saldrían en blanco;
 *  · SIN allow-same-origin: la web queda en un origen opaco, así que no puede leer
 *    nuestras cookies ni el almacenamiento del panel, ni nosotros los suyos;
 *  · SIN allow-top-navigation: no puede llevarse el panel a otra dirección;
 *  · SIN allow-forms ni allow-popups: es para mirar, no para usar.
 * `referrerpolicy="no-referrer": su servidor no sabe desde qué pantalla de Tentare
 * se la mira. `loading="lazy"`: no se pide hasta que se ve.
 */
export function htmlDelMarco(origen: string): string {
  const src = `${new URL(origen).origin}/`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${aAtributo(TITULO_DE_SU_WEB)}</title>
<style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe src="${aAtributo(src)}" title="${aAtributo(TITULO_DE_SU_WEB)}" sandbox="${SANDBOX_DE_SU_WEB}" referrerpolicy="no-referrer" loading="lazy"></iframe>
</body>
</html>`;
}
