// Reescribe las rutas RELATIVAS de un HTML/CSS a las URLs absolutas donde
// quedaron subidos sus ficheros en R2.
//
// Por qué hace falta: el HTML/CSS original referencia sus propios assets con
// rutas relativas ("./hero.webp", "../fonts/inter.woff2") porque asumía que
// todo el proyecto se serviría junto, en el mismo sitio. Aquí cada fichero
// vive en una clave de R2 distinta — sin reescribir, el navegador pediría
// "hero.webp" relativo a la URL del propio iframe y sería un 404, porque el
// fichero real está en R2.
//
// ⚠️ Esto NO es "reconstruir" el tema (la regla del punto 5 del encargo): el
// HTML y el CSS originales no se tocan en su estructura, selectores, media
// queries, keyframes ni nada — SOLO se sustituye el valor de una URL relativa
// por la absoluta que apunta al mismo fichero, byte a byte idéntico, ahora en
// otro sitio. Es exactamente lo que hace un CDN al servir un build: mover los
// ficheros de sitio no es lo mismo que reescribir su contenido.
//
// Puro: no toca red ni filesystem, solo texto. Testeable con `node --test`.

/** Rutas que NO se tocan: absolutas, protocolo-relativas, data URIs, anchors. */
function esRutaExterna(ruta: string): boolean {
  return (
    ruta.startsWith('http://') || ruta.startsWith('https://') ||
    ruta.startsWith('//') || ruta.startsWith('data:') ||
    ruta.startsWith('#') || ruta.startsWith('mailto:') || ruta.startsWith('tel:')
  );
}

/** Resuelve una ruta relativa contra la carpeta del fichero que la referencia. */
function resolverRelativa(base: string, relativa: string): string {
  const carpetaBase = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const partes = (carpetaBase + relativa).split('/');
  const resueltas: string[] = [];
  for (const parte of partes) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') resueltas.pop();
    else resueltas.push(parte);
  }
  return resueltas.join('/');
}

/**
 * Reescribe las rutas relativas de un HTML: `src`, `href` (salvo anchors) y
 * `url(...)` dentro de `style=""` inline.
 *
 * @param rutaFichero Ruta del propio HTML dentro del manifest, para resolver
 *   sus relativas contra su carpeta — no siempre es la raíz.
 * @param urlAbsoluta Dada una ruta YA resuelta (relativa a la raíz del ZIP),
 *   la URL pública en R2. `undefined` si esa ruta no está en el manifest —
 *   entonces no se toca (mejor un enlace roto visible que inventar una URL).
 */
export function reescribirHtml(
  html: string,
  rutaFichero: string,
  urlAbsoluta: (rutaResuelta: string) => string | undefined,
): string {
  const reemplazarAtributo = (m: string, previo: string, valor: string, siguiente: string) => {
    if (esRutaExterna(valor)) return m;
    const resuelta = resolverRelativa(rutaFichero, valor);
    const url = urlAbsoluta(resuelta);
    return url ? `${previo}${url}${siguiente}` : m;
  };

  let salida = html.replace(
    /((?:src|href)\s*=\s*")([^"]+)(")/gi,
    reemplazarAtributo,
  );
  salida = salida.replace(
    /((?:src|href)\s*=\s*')([^']+)(')/gi,
    reemplazarAtributo,
  );
  salida = salida.replace(
    /(url\(\s*)(['"]?)(?!https?:|\/\/|data:)([^)'"]+)\2(\s*\))/gi,
    (m, previo, comilla, valor, siguiente) => {
      const resuelta = resolverRelativa(rutaFichero, valor);
      const url = urlAbsoluta(resuelta);
      return url ? `${previo}${comilla}${url}${comilla}${siguiente}` : m;
    },
  );
  return salida;
}

/** Lo mismo, para el interior de una hoja de estilos (`url(...)` en CSS). */
export function reescribirCss(
  css: string,
  rutaFichero: string,
  urlAbsoluta: (rutaResuelta: string) => string | undefined,
): string {
  // Las comillas (o su ausencia) se PRESERVAN — `url(x.png)` sigue sin
  // comillas, `url('x.png')` las conserva. Es la misma regla del punto 5 del
  // encargo aplicada al detalle: solo cambia el valor, nunca el estilo del
  // fichero original.
  return css.replace(
    /(url\(\s*)(['"]?)(?!https?:|\/\/|data:)([^)'"]+)\2(\s*\))/gi,
    (m, previo, comilla, valor, siguiente) => {
      const resuelta = resolverRelativa(rutaFichero, valor);
      const url = urlAbsoluta(resuelta);
      return url ? `${previo}${comilla}${url}${comilla}${siguiente}` : m;
    },
  );
}
