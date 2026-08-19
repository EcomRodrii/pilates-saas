import { LEGAL } from '@/lib/legal-info';
import { NAV_LINKS } from './landing/data';

// Mismos 3 perfiles reales que enlaza el pie de la landing
// (components/landing/SeccionCtaFinal.tsx, REDES_TENTARE) — verificados
// uno a uno antes de publicarlos, 2026-08-18. No añadir ninguno aquí que
// no esté también enlazado ahí.
const REDES_SOCIALES_TENTARE = [
  'https://x.com/tentaresoftware',
  'https://www.instagram.com/tentareapp/',
  'https://www.linkedin.com/company/tentare/',
];

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
    sameAs: REDES_SOCIALES_TENTARE,
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
