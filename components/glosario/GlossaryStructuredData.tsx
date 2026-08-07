import { LEGAL } from '@/lib/legal-info';

// DefinedTermSet + DefinedTerm — el tipo de Schema.org pensado exactamente
// para un glosario, más preciso que Article/FAQPage para este contenido:
// una IA que busca la definición neutral de un término del sector puede
// extraer cada `DefinedTerm` como unidad propia, con su propia URL ancla.
export function GlossaryStructuredData({ terms }: { terms: { slug: string; name: string; description: string }[] }) {
  const url = `${LEGAL.url}/glosario`;

  const definedTermSetLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'Glosario del software de gestión para estudios de Pilates',
    url,
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.name,
      description: t.description,
      url: `${url}#${t.slug}`,
      inDefinedTermSet: url,
    })),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Glosario', item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
