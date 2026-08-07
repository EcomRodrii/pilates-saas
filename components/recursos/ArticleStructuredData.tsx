import { LEGAL } from '@/lib/legal-info';

// BreadcrumbList + Article/BlogPosting JSON-LD para una guía de /recursos.
// Separado del listado (BreadcrumbListRecursos, más abajo) porque una guía
// tiene un nivel más en la miga de pan y campos propios de Article
// (headline/datePublished) que el listado no tiene.
export function ArticleStructuredData({
  title,
  description,
  slug,
  datePublished,
  dateModified = datePublished,
}: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
}) {
  const url = `${LEGAL.url}/recursos/${slug}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Recursos', item: `${LEGAL.url}/recursos` },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    datePublished,
    dateModified,
    author: { '@type': 'Organization', name: LEGAL.marca, url: LEGAL.url },
    publisher: { '@type': 'Organization', name: LEGAL.marca, url: LEGAL.url },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, '\\u003c') }} />
    </>
  );
}

// BreadcrumbList del listado /recursos (un nivel: Inicio > Recursos).
export function RecursosBreadcrumb() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Recursos', item: `${LEGAL.url}/recursos` },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />;
}

// BreadcrumbList genérico de un nivel (Inicio > página) para páginas sueltas
// como /comparativa o /seguridad, que no cuelgan de /recursos.
export function PageBreadcrumb({ path, name }: { path: string; name: string }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name, item: `${LEGAL.url}${path}` },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />;
}
