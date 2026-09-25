// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD de /recursos: BlogPosting de cada guía y Blog del listado.
//
// Funciones puras (se prueban con `node --test` en schema.test.ts); los
// componentes de components/recursos/ArticleStructuredData.tsx solo las pintan.
// Todo lo que es de la guía —fechas, sección, portada— sale de
// lib/recursos/guias.ts; el titular y la descripción siguen llegando de cada
// page.tsx, que es donde viven su <h1> y su metadata.
//
// Sin alias `@/`: mismo motivo que guias.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { LEGAL } from '../legal-info.ts';
import { ANCHO_MAX_PORTADA, GUIAS, fechaModificada, guia, rutaPortada, altoPortada, urlGuia, type Guia } from './guias.ts';
import { ARTICULOS, fechaArticulo, urlArticulo } from './articulos/index.ts';

/** `@id` estable del Blog: el mismo en el listado y en el `isPartOf` de cada guía. */
export const ID_BLOG = `${LEGAL.url}/recursos#blog`;

const IDIOMA = 'es-ES';

/** El autor, tal como firma la cabecera de cada guía (ArticleShell). Su página es /sobre-tentare (antes apuntaba al aviso legal). */
export const AUTOR = { '@type': 'Person', '@id': `${LEGAL.url}/sobre-tentare#fundador`, name: 'Marcos Roca', jobTitle: 'Fundador de Tentare', url: `${LEGAL.url}/sobre-tentare` } as const;

/** Logo del editor: el lockup horizontal que ya sirve public/ (1200×319). */
export const PUBLISHER = {
  '@type': 'Organization',
  name: LEGAL.marca,
  url: LEGAL.url,
  logo: { '@type': 'ImageObject', url: `${LEGAL.url}/logo-horizontal.png`, width: 1200, height: 319 },
} as const;

/** La imagen OG que genera cada guía (app/recursos/<slug>/opengraph-image.tsx), 1200×630. */
export const TAMANO_OG = { width: 1200, height: 630 } as const;

/** La portada en su derivado mayor (WebP de 480), en URL absoluta. */
export function imagenPortada(g: Guia) {
  return {
    '@type': 'ImageObject',
    url: `${LEGAL.url}${rutaPortada(g.portada, ANCHO_MAX_PORTADA, 'webp')}`,
    width: ANCHO_MAX_PORTADA,
    height: altoPortada(g.portada, ANCHO_MAX_PORTADA),
  };
}

/**
 * Imágenes del BlogPosting: primero la OG de 1200×630 (Google pide al menos
 * 1200 px de ancho para mostrarla grande) y después la portada, que es la
 * que ve quien lee pero solo mide 480 px. La URL de la OG es la ruta estable
 * del fichero-convención de Next, sin el parámetro de caché que añade al <head>.
 */
export function imagenesGuia(g: Guia) {
  return [
    { '@type': 'ImageObject', url: `${LEGAL.url}${urlGuia(g.slug)}/opengraph-image`, ...TAMANO_OG },
    imagenPortada(g),
  ];
}

export function blogPostingLd({ slug, titulo, descripcion }: { slug: string; titulo: string; descripcion: string }) {
  const g = guia(slug);
  const url = `${LEGAL.url}${urlGuia(slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: titulo,
    description: descripcion,
    url,
    image: imagenesGuia(g),
    datePublished: g.publicado,
    dateModified: fechaModificada(g),
    inLanguage: IDIOMA,
    articleSection: g.seccion,
    author: AUTOR,
    publisher: PUBLISHER,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'Blog', '@id': ID_BLOG },
  };
}

/** El listado /recursos como Blog, con SOLO las guías publicadas (las que tienen página). */
export function blogLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': ID_BLOG,
    name: 'Centro de Recursos de Tentare',
    description: 'Guías prácticas para propietarias de estudios de Pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó.',
    url: `${LEGAL.url}/recursos`,
    inLanguage: IDIOMA,
    publisher: PUBLISHER,
    blogPost: [
      // Los artículos escritos como datos (lib/recursos/articulos) no tienen
      // portada: su imagen es la OG que genera su ruta.
      ...ARTICULOS.map((a) => ({
        '@type': 'BlogPosting',
        headline: a.titulo,
        url: `${LEGAL.url}${urlArticulo(a.slug)}`,
        datePublished: a.publicado,
        dateModified: fechaArticulo(a),
        image: { '@type': 'ImageObject', url: `${LEGAL.url}${urlArticulo(a.slug)}/opengraph-image`, ...TAMANO_OG },
      })),
      ...GUIAS.map((g) => ({
        '@type': 'BlogPosting',
        headline: g.titulo,
        url: `${LEGAL.url}${urlGuia(g.slug)}`,
        datePublished: g.publicado,
        dateModified: fechaModificada(g),
        image: imagenPortada(g),
      })),
    ],
  };
}

/** Los campos de artículo del Open Graph de una guía (se suman a los de su metadata). */
export function openGraphGuia(slug: string) {
  const g = guia(slug);
  return {
    publishedTime: g.publicado,
    modifiedTime: fechaModificada(g),
    authors: [AUTOR.name],
    section: g.seccion,
  };
}

/** Para el sitemap: las imágenes de la página de una guía, en URL absoluta. */
export function imagenesSitemap(path: string): string[] {
  const g = GUIAS.find((x) => urlGuia(x.slug) === path);
  return g ? [imagenPortada(g).url] : [];
}
