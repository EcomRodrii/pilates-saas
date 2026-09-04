import { LEGAL } from '@/lib/legal-info';
import type { Miga } from './AyudaBreadcrumbs';

// BreadcrumbList JSON-LD para /ayuda — mismo criterio y forma que
// components/recursos/ArticleStructuredData.tsx, pero con "Centro de Ayuda"
// como raíz en vez de "Recursos".
export function AyudaBreadcrumbStructuredData({ items }: { items: Miga[] }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: item.href ? `${LEGAL.url}${item.href}` : undefined,
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />;
}

export function AyudaArticleStructuredData({
  titulo, descripcion, path, actualizado,
}: { titulo: string; descripcion: string; path: string; actualizado: string }) {
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: titulo,
    description: descripcion,
    url: `${LEGAL.url}${path}`,
    dateModified: actualizado,
    author: { '@type': 'Organization', name: LEGAL.marca, url: LEGAL.url },
    publisher: { '@type': 'Organization', name: LEGAL.marca, url: LEGAL.url },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${LEGAL.url}${path}` },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, '\\u003c') }} />;
}
