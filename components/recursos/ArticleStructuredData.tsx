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

// FAQPage JSON-LD para las guías que ya muestran <ArticleFaq> en pantalla —
// mismo array `items` que recibe ese componente, para no duplicar contenido:
// Google puede mostrar estas preguntas como rich snippet directamente en el buscador.
export function FaqStructuredData({ items }: { items: { q: string; a: string }[] }) {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />;
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

// BreadcrumbList de dos niveles bajo /comparativa (Inicio > Comparativa > Tentare vs X)
// para las páginas 1-vs-1 en /comparativa/tentare-vs-*.
export function ComparativaBreadcrumb({ slug, name }: { slug: string; name: string }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Comparativa', item: `${LEGAL.url}/comparativa` },
      { '@type': 'ListItem', position: 3, name, item: `${LEGAL.url}/comparativa/${slug}` },
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
