import { LEGAL } from '@/lib/legal-info';
import { blogLd, blogPostingLd } from '@/lib/recursos/schema';

// BreadcrumbList + BlogPosting JSON-LD para una guía de /recursos.
// Separado del listado (RecursosBreadcrumb y RecursosBlogStructuredData, más
// abajo) porque una guía tiene un nivel más en la miga de pan y campos propios.
//
// ⚠️ Las fechas, la sección y la imagen NO se pasan por props: salen del
// registro de guías (lib/recursos/guias.ts) dentro de `blogPostingLd`, que es
// una función pura con su test. Antes cada page.tsx escribía su `datePublished`
// a mano y el sitemap tenía otra copia de las mismas fechas.
export function ArticleStructuredData({
  title,
  description,
  slug,
}: {
  title: string;
  description: string;
  slug: string;
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

  const articleLd = blogPostingLd({ slug, titulo: title, descripcion: description });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, '\\u003c') }} />
    </>
  );
}

// Blog JSON-LD del listado /recursos: sus guías publicadas, con `@id` estable
// para que el `isPartOf` de cada BlogPosting apunte aquí.
export function RecursosBlogStructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd()).replace(/</g, '\\u003c') }} />;
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
