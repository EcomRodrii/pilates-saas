// Resolución segura de los enlaces que teclea el estudio.
//
// Módulo propio, y no dentro de portal-home-bloques.ts, por un motivo
// concreto: el motor de campos (lib/theme/campos.ts) necesita saber si un
// href/vídeo es válido para resolver `completoSi`, y portal-home-bloques.ts
// ya importa el motor — importarlo de vuelta sería un ciclo. La alternativa
// que había (duplicar la validación dentro del motor) resultó ser peor que
// el ciclo: las dos copias YA divergían en ambos sentidos. El motor daba por
// bueno `https://youtube.com/` (sin id) y `https://vimeo.com/abc`, que el
// render resuelve a `null`, y rechazaba `m.youtube.com`, que el render sí
// acepta. Con el motor decidiendo si un bloque está completo, la primera
// divergencia acaba en un `<iframe src={null}>` en la pantalla de una socia.
//
// Puro y sin dependencias, para que lo pueda importar cualquiera de los dos.

/**
 * Resuelve el `href` de un bloque (banner/cta) a algo seguro para enlazar, o
 * `null` si no lo es. No basta con validar en el editor: el dato viene de
 * jsonb guardado por el estudio, que pudo teclear cualquier cosa. Un link
 * interno es una ruta ("/reservar"); uno externo solo se acepta si es
 * http(s) — nada de `javascript:`/`data:`. Mismo criterio que
 * hrefExternoSeguro() en app/portal/[slug]/home/page.tsx (banners legacy).
 */
export function resolverHrefBloque(href: string): { interno: true; valor: string } | { interno: false; valor: string } | null {
  const v = href.trim();
  if (!v) return null;
  if (v.startsWith('/')) return { interno: true, valor: v };
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? { interno: false, valor: v } : null;
  } catch {
    return null;
  }
}

/**
 * Resuelve la URL de un bloque `video` a una URL de EMBED segura, o `null`
 * si no lo es. El dato viene de jsonb tecleado por el estudio — nunca se
 * mete crudo en un `<iframe src>`: solo YouTube/Vimeo por whitelist de host,
 * mismo criterio de "validar en el render, no solo en el editor" que
 * resolverHrefBloque().
 */
export function resolverVideoEmbed(url: string): string | null {
  const v = url.trim();
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.startsWith('/embed/') ? u.pathname.slice('/embed/'.length) : null;
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.slice(1).split('/')[0];
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'player.vimeo.com') {
    return u.pathname.startsWith('/video/') ? v : null;
  }
  return null;
}
