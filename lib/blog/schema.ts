// JSON-LD del blog personal del fundador, como funciones PURAS (se prueban con `node --test`; los componentes solo las
// pintan). Una sola entidad para la persona (`ID_AUTOR`): la define la página de autor y la referencian por @id la
// Organization (`founder`), las guías de /recursos y cada artículo del blog. Sin alias `@/`.

import { LEGAL } from '../legal-info.ts';
import { AUTOR_BLOG, ID_AUTOR, ID_BLOG_PERSONAL, LINKEDIN_PERSONAL, RUTA_AUTOR, RUTA_BLOG, URL_AUTOR, URL_BLOG } from './autor.ts';
import { categoriaBlog } from './categorias.ts';
import { fechaArticuloBlog, urlArticuloBlog, type ArticuloBlogMeta } from './util.ts';

const IDIOMA = 'es-ES';
/** El mismo @id de la Organization que pinta cada página (components/OrganizationStructuredData.tsx). */
export const ID_ORGANIZACION_BLOG = `${LEGAL.url}/#organizacion`;

const abs = (ruta: string) => `${LEGAL.url}${ruta}`;

export const IMAGEN_RETRATO = {
  '@type': 'ImageObject',
  url: abs(`${AUTOR_BLOG.foto.base}-${AUTOR_BLOG.foto.ancho}.webp`),
  width: AUTOR_BLOG.foto.ancho,
  height: AUTOR_BLOG.foto.alto,
} as const;

export const IMAGEN_OG = {
  '@type': 'ImageObject',
  url: abs(AUTOR_BLOG.og.ruta),
  width: AUTOR_BLOG.og.ancho,
  height: AUTOR_BLOG.og.alto,
} as const;

/** El Person completo. `sameAs` solo lleva perfiles PERSONALES verificados: hoy ninguno (ver LINKEDIN_PERSONAL). */
export function personaLd() {
  return {
    '@type': 'Person',
    '@id': ID_AUTOR,
    name: AUTOR_BLOG.nombre,
    alternateName: [AUTOR_BLOG.nombreCorto],
    givenName: 'Marcos',
    familyName: 'Roca Rodríguez',
    jobTitle: AUTOR_BLOG.cargo,
    description: `${AUTOR_BLOG.nombre} es el fundador de Tentare, un software de gestión para estudios de Pilates y yoga en España. Trabaja desde ${AUTOR_BLOG.ciudad}.`,
    url: URL_AUTOR,
    image: IMAGEN_RETRATO,
    worksFor: { '@id': ID_ORGANIZACION_BLOG },
    address: { '@type': 'PostalAddress', addressLocality: AUTOR_BLOG.ciudad, addressCountry: 'ES' },
    knowsAbout: [...AUTOR_BLOG.conoceDe],
    ...(LINKEDIN_PERSONAL ? { sameAs: [LINKEDIN_PERSONAL] } : {}),
  };
}

/** La página de autor: ProfilePage con su Person. */
export function perfilLd(actualizado: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${URL_AUTOR}#pagina`,
        url: URL_AUTOR,
        name: `${AUTOR_BLOG.nombre}, ${AUTOR_BLOG.cargo.toLowerCase()}`,
        inLanguage: IDIOMA,
        isPartOf: { '@id': `${LEGAL.url}/#web` },
        dateModified: actualizado,
        mainEntity: { '@id': ID_AUTOR },
        primaryImageOfPage: IMAGEN_OG,
      },
      personaLd(),
    ],
  };
}

/** El listado /blog como Blog, con SOLO lo publicado. */
export function blogLd(metas: readonly ArticuloBlogMeta[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': ID_BLOG_PERSONAL,
    name: `Blog de ${AUTOR_BLOG.nombre}`,
    description: 'El blog personal del fundador de Tentare: emprendimiento, tecnología, startups y la construcción de Tentare.',
    url: URL_BLOG,
    inLanguage: IDIOMA,
    author: { '@id': ID_AUTOR },
    publisher: { '@id': ID_ORGANIZACION_BLOG },
    blogPost: metas.map((m) => ({
      '@type': 'BlogPosting',
      headline: m.titulo,
      url: abs(urlArticuloBlog(m.slug)),
      datePublished: m.publicado,
      dateModified: fechaArticuloBlog(m),
      author: { '@id': ID_AUTOR },
    })),
  };
}

export function articuloBlogLd(m: ArticuloBlogMeta, palabras: number) {
  const url = abs(urlArticuloBlog(m.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#articulo`,
    headline: m.titulo,
    description: m.descripcion,
    url,
    image: [{ ...IMAGEN_OG, url: abs(`${urlArticuloBlog(m.slug)}/opengraph-image`) }],
    datePublished: m.publicado,
    dateModified: fechaArticuloBlog(m),
    inLanguage: IDIOMA,
    articleSection: categoriaBlog(m.categoria)?.nombre,
    wordCount: palabras,
    author: { '@id': ID_AUTOR },
    publisher: { '@id': ID_ORGANIZACION_BLOG },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@id': ID_BLOG_PERSONAL },
  };
}

export function migasBlogLd(migas: readonly { nombre: string; ruta: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      ...migas.map((m, i) => ({ '@type': 'ListItem', position: i + 2, name: m.nombre, item: abs(m.ruta) })),
    ],
  };
}

export const MIGAS_BLOG = { nombre: 'Blog', ruta: RUTA_BLOG } as const;
export const MIGAS_AUTOR = { nombre: AUTOR_BLOG.nombre, ruta: RUTA_AUTOR } as const;

// ── RSS 2.0 ──────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Una fecha AAAA-MM-DD como fecha RFC 822 (mediodía UTC: el día no depende del huso). */
export function fechaRfc822(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

export function rssBlog(metas: readonly ArticuloBlogMeta[]): string {
  const ultimo = metas.length ? metas.map(fechaArticuloBlog).sort().at(-1)! : undefined;
  const items = metas.map((m) => {
    const url = abs(urlArticuloBlog(m.slug));
    return `    <item>
      <title>${esc(m.titulo)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${fechaRfc822(m.publicado)}</pubDate>
      <category>${esc(categoriaBlog(m.categoria)?.nombre ?? '')}</category>
      <description>${esc(m.descripcion)}</description>
      <dc:creator>${esc(AUTOR_BLOG.nombre)}</dc:creator>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Blog de ${esc(AUTOR_BLOG.nombre)}</title>
    <link>${URL_BLOG}</link>
    <atom:link href="${URL_BLOG}/feed.xml" rel="self" type="application/rss+xml" />
    <description>El blog personal del fundador de Tentare: emprendimiento, tecnología, startups y la construcción de Tentare.</description>
    <language>es-es</language>${ultimo ? `\n    <lastBuildDate>${fechaRfc822(ultimo)}</lastBuildDate>` : ''}
${items.join('\n')}
  </channel>
</rss>
`;
}
