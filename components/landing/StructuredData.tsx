import { FAQ_ITEMS, PLANS } from './data';
import { BASE_URL } from '@/lib/seo/paginas';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';

function planPriceToNumber(price: string): number {
  return Number(price.replace('€', ''));
}

export function StructuredData() {
  const softwareApplicationLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${BASE_URL}/#software`,
    name: 'Tentare',
    applicationCategory: 'BusinessApplication',
    // «Web» y no «iOS, Android»: no hay app nativa en las tiendas. La app de la
    // alumna se instala desde el navegador (PWA) y el panel es web.
    operatingSystem: 'Web',
    url: BASE_URL,
    publisher: { '@id': ID_ORGANIZACION },
    description:
      'Software para estudios de Pilates en España: reservas, cobros, calendario, alumnas e instructoras, y sustituciones automáticas ante bajas.',
    // TODO: añadir `aggregateRating` ({ '@type': 'AggregateRating', ratingValue,
    // reviewCount }) en cuanto haya reseñas reales del SOFTWARE Tentare
    // (p. ej. G2/Capterra, o un módulo de testimonios propio) — nunca un valor
    // inventado, Google Rich Results lo penaliza. `lib/inngest/valoraciones.ts`
    // es un sistema distinto: valora las CLASES de cada estudio, no el producto.
    // Cada plan con su periodo (mensual, IVA incluido) y la página de precios:
    // sin `unitCode`, «29 €» no dice si es al mes o para siempre, y los
    // buscadores con IA citan justo eso.
    offers: PLANS.map((plan) => {
      const price = planPriceToNumber(plan.price);
      return {
        '@type': 'Offer',
        name: plan.name,
        price,
        priceCurrency: 'EUR',
        description: plan.desc,
        url: `${BASE_URL}/precios`,
        availability: 'https://schema.org/InStock',
        eligibleRegion: { '@type': 'Country', name: 'ES' },
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price,
          priceCurrency: 'EUR',
          valueAddedTaxIncluded: true,
          referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
        },
      };
    }),
  };

  const faqPageLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
