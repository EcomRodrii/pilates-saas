import { FAQ_ITEMS, PLANS } from './data';

const BASE_URL = 'https://tentare.app';

function planPriceToNumber(price: string): number {
  return Number(price.replace('€', ''));
}

export function StructuredData() {
  const softwareApplicationLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tentare',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: BASE_URL,
    description:
      'Software para estudios de Pilates en España: reservas, cobros, calendario, alumnas e instructoras, y sustituciones automáticas ante bajas.',
    // TODO: añadir `aggregateRating` ({ '@type': 'AggregateRating', ratingValue,
    // reviewCount }) en cuanto haya reseñas reales del SOFTWARE Tentare
    // (p. ej. G2/Capterra, o un módulo de testimonios propio) — nunca un valor
    // inventado, Google Rich Results lo penaliza. `lib/inngest/valoraciones.ts`
    // es un sistema distinto: valora las CLASES de cada estudio, no el producto.
    offers: PLANS.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: planPriceToNumber(plan.price),
      priceCurrency: 'EUR',
      description: plan.desc,
    })),
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
