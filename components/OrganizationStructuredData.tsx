import { LEGAL } from '@/lib/legal-info';

// JSON-LD sitewide (Organization + WebSite con SearchAction) — vive en el
// root layout porque aplica a todo tentare.app, a diferencia del
// SoftwareApplication/FAQPage de la home (components/landing/StructuredData.tsx),
// que son específicos de esa página.
export function OrganizationStructuredData() {
  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: LEGAL.marca,
    url: LEGAL.url,
    email: LEGAL.email,
    contactPoint: {
      '@type': 'ContactPoint',
      email: LEGAL.email,
      contactType: 'customer support',
      areaServed: 'ES',
      availableLanguage: ['Spanish'],
    },
  };

  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: LEGAL.marca,
    url: LEGAL.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${LEGAL.url}/recursos?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
