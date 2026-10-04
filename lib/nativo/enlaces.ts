// Qué enlaces puede abrir la app nativa por dentro, y a qué ruta van.
//
// Puro y sin Capacitor: lo usa lib/nativo/puente.ts, pero se prueba sin
// navegador (enlaces.test.ts).
//
// Un enlace llega a la app por tres caminos, y los tres acaban aquí:
//   - Universal Link: un enlace a `www.tentare.app/portal/…` tocado en Mail,
//     Mensajes o Safari (entitlement `applinks:`).
//   - El esquema propio de la app (`<bundle id>://…`, Info.plist →
//     CFBundleURLTypes): la vuelta del login con Google, que iOS no entrega
//     como Universal Link desde dentro de SFSafariViewController.
//   - Un aviso push: su `url`, la misma que ya lleva el push web (public/sw.js).
//
// ⚠️ Lo que sale de aquí se le pasa a `router.push` o a `location`, así que
// devuelve SOLO ruta + query de Tentare, nunca una URL. Cualquier otra cosa —
// otro host, `//otro-host` (que el navegador lee como URL absoluta), un puerto,
// credenciales en la URL, `javascript:` — se descarta. El fragmento (#…) se
// descarta también: ningún flujo de la app lo necesita y es donde viajarían
// tokens en un flujo OAuth implícito.

import { LEGAL } from '../legal-info.ts';

/** Los hosts que la app abre por dentro (capacitor.config.ts → allowNavigation):
 *  el canónico y el ápice, que hoy redirige a él. Salen de lib/legal-info.ts,
 *  la fuente única del origen (lo vigila lib/seo/paginas.test.ts). */
export const HOSTS_TENTARE: readonly string[] = [LEGAL.dominio, LEGAL.dominio.replace(/^www\./, '')];

const ORIGEN_TENTARE = LEGAL.url;

function aRutaSegura(ruta: string, query: string): string | null {
  // `//host/x` o `/\host` los lee el navegador como URL de otro sitio.
  const limpia = ruta.replace(/^\/{2,}/, '/');
  if (!limpia.startsWith('/') || limpia.includes('\\')) return null;
  return limpia + query;
}

/**
 * La ruta interna (path + query) a la que lleva un enlace entrante, o `null`
 * si el enlace no es de Tentare.
 *
 * @param esquemasPropios los esquemas de URL propios de ESTA app (su bundle id:
 *   `app.tentare`, o el de la app de un estudio). Sin ellos, solo valen https.
 */
export function rutaInternaDeEnlace(url: string, esquemasPropios: readonly string[] = []): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;

  if (u.protocol === 'https:') {
    if (u.port || !HOSTS_TENTARE.includes(u.hostname)) return null;
    return aRutaSegura(u.pathname || '/', u.search);
  }

  const esquema = u.protocol.slice(0, -1).toLowerCase();
  if (!esquemasPropios.some((e) => e.toLowerCase() === esquema)) return null;
  // `app.tentare://auth/vuelta?code=…`: en un esquema propio lo que parece el
  // host es en realidad el primer tramo de la ruta.
  if (u.port) return null;
  return aRutaSegura(`/${u.hostname}${u.pathname}`, u.search);
}

/**
 * La ruta a la que lleva pulsar un aviso push, o `null`. Acepta lo que ya manda
 * el push web en `data.url` (ruta relativa o URL absoluta de Tentare) y
 * `data.ruta` como alias.
 */
export function rutaDeAviso(datos: unknown): string | null {
  if (!datos || typeof datos !== 'object') return null;
  const d = datos as Record<string, unknown>;
  const valor = typeof d.url === 'string' ? d.url : typeof d.ruta === 'string' ? d.ruta : null;
  if (!valor) return null;
  let absoluta: string;
  try {
    // Una ruta relativa se resuelve contra Tentare; una absoluta (o `//otro`)
    // conserva su host y la filtra `rutaInternaDeEnlace`.
    absoluta = new URL(valor, ORIGEN_TENTARE).href;
  } catch {
    return null;
  }
  return rutaInternaDeEnlace(absoluta);
}

/**
 * ¿Es esta ruta la vuelta de un flujo OAuth? Lo es si trae `code` (PKCE) o
 * `error` en la query y, si se pide, empieza por `prefijo`.
 */
export function esVueltaDeOAuth(ruta: string, prefijo = '/'): boolean {
  if (!ruta.startsWith(prefijo)) return false;
  const i = ruta.indexOf('?');
  if (i < 0) return false;
  const q = new URLSearchParams(ruta.slice(i + 1));
  return q.has('code') || q.has('error');
}

/**
 * Lo que trae la vuelta de un login por navegador (`/auth/vuelta?code=…`): el
 * código para canjear, o el error que devolvió el proveedor (`access_denied` si
 * la persona dijo que no). `null` si no es una vuelta.
 */
export function resultadoDeVuelta(ruta: string): { codigo: string } | { error: string } | null {
  const i = ruta.indexOf('?');
  if (i < 0) return null;
  const q = new URLSearchParams(ruta.slice(i + 1));
  const codigo = q.get('code');
  if (codigo) return { codigo };
  const error = q.get('error');
  return error ? { error: q.get('error_description') || error } : null;
}

/** Solo http(s) se abre «fuera»: nunca `javascript:`, `data:` ni `file:`. */
export function esUrlAbrible(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
