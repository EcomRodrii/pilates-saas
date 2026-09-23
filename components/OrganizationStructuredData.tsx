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

// JSON-LD sitewide (Organization + WebSite). La misma entidad en todas las
// páginas públicas, con un `@id` estable al que se refieren el resto de bloques
// (SoftwareApplication de la home, artículos…): así Google y los buscadores con
// IA ven UNA organización, no una por página (fase 5 del rediseño, 23-sep).
//
// Sin SearchAction desde el 23-sep: apuntaba a una búsqueda de /recursos que
// solo existe en el cliente, y Google retiró el cuadro de búsqueda del
// resultado. Y sin `logo` hasta entonces: ahora el icono de 512 px, que es
// cuadrado y sin texto, como pide Google para el logo de una organización.
export const ID_ORGANIZACION = `${LEGAL.url}/#organizacion`;
export const ID_WEB = `${LEGAL.url}/#web`;
/** El fundador (definido en /sobre-tentare); la organización lo enlaza por @id. */
export const ID_FUNDADOR = `${LEGAL.url}/sobre-tentare#fundador`;
export function OrganizationStructuredData() {
  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ID_ORGANIZACION,
    name: LEGAL.marca,
    url: LEGAL.url,
    founder: { '@id': ID_FUNDADOR },
    logo: { '@type': 'ImageObject', url: `${LEGAL.url}/icon-512.png`, width: 512, height: 512 },
    description: 'Software de gestión para estudios de Pilates y Yoga en España: reservas, cobros, bonos y sustituciones de instructoras.',
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
    '@id': ID_WEB,
    name: LEGAL.marca,
    url: LEGAL.url,
    inLanguage: 'es-ES',
    publisher: { '@id': ID_ORGANIZACION },
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
