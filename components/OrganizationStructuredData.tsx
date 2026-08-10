import { LEGAL } from '@/lib/legal-info';
import { NAV_LINKS } from './landing/data';

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

  // Candidatas a sitelinks orgánicos (los sub-enlaces desplegables bajo el
  // resultado de búsqueda). Google decide si mostrarlos y con qué texto —
  // esto no los fuerza, solo le da la señal correcta una vez haya volumen
  // de búsquedas de marca. Reusa NAV_LINKS para no mantener dos listas.
  const navigationLd = NAV_LINKS.map((l) => ({
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: l.label,
    url: l.href.startsWith('#') ? `${LEGAL.url}/${l.href}` : `${LEGAL.url}${l.href}`,
  }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd).replace(/</g, '\\u003c') }} />
      {navigationLd.map((ld) => (
        <script key={ld.name} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      ))}
    </>
  );
}
