// JSON-LD de un artículo de /recursos escrito como datos: BlogPosting (con sus
// fuentes como `citation`), FAQPage y BreadcrumbList. Funciones puras.
//
// Sin alias `@/`: mismo motivo que tipos.ts.

import { LEGAL } from '../../legal-info.ts';
import { AUTOR, ID_BLOG, PUBLISHER, TAMANO_OG } from '../schema.ts';
import { fechaArticulo, urlArticulo } from './index.ts';
import { contarPalabras } from './validar.ts';
import type { Articulo } from './tipos.ts';

/** Quita el marcado mínimo (**negrita**, [enlace](url)) para los textos del JSON-LD. */
export function textoPlano(t: string): string {
  return t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1');
}

export function articuloLd(a: Articulo) {
  const url = `${LEGAL.url}${urlArticulo(a.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.titulo,
    description: a.descripcion,
    abstract: textoPlano(a.respuesta),
    url,
    image: [{ '@type': 'ImageObject', url: `${url}/opengraph-image`, ...TAMANO_OG }],
    datePublished: a.publicado,
    dateModified: fechaArticulo(a),
    inLanguage: 'es-ES',
    articleSection: a.seccion,
    wordCount: contarPalabras(a),
    keywords: [a.consultaPrincipal, ...a.consultas].join(', '),
    author: AUTOR,
    publisher: PUBLISHER,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@type': 'Blog', '@id': ID_BLOG },
    ...(a.fuentes.length
      ? { citation: a.fuentes.map((f) => ({ '@type': 'CreativeWork', name: f.titulo, url: f.url })) }
      : {}),
  };
}

export function faqLd(a: Articulo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: a.faq.map((f) => ({
      '@type': 'Question',
      name: textoPlano(f.q),
      acceptedAnswer: { '@type': 'Answer', text: textoPlano(f.a) },
    })),
  };
}

export function migasLd(a: Articulo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Recursos', item: `${LEGAL.url}/recursos` },
      { '@type': 'ListItem', position: 3, name: a.titulo, item: `${LEGAL.url}${urlArticulo(a.slug)}` },
    ],
  };
}
