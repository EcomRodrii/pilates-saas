import { FAQ_ITEMS, PLANS } from './data';
import { BASE_URL } from '@/lib/seo/paginas';
import { TRIAL_DIAS } from '@/lib/billing/trial';
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
      'Software para estudios y centros de Pilates en España: reservas online y lista de espera, app con la marca del estudio para las alumnas, bonos, cuotas y cobros, calendario por salas y gestión del equipo.',
    inLanguage: 'es-ES',
    // Lo que el producto hace hoy, en las palabras de la página (nada congelado
    // ni «próximamente»; ver lib/frozen-features.ts).
    featureList: [
      'Reservas online por clase y por reformer, con lista de espera',
      'App con el nombre, el logo y los colores del estudio',
      'Bonos, cuotas mensuales y cobros con tarjeta o SEPA, con reintento de cobros',
      'Facturas con numeración legal',
      'Calendario por salas',
      'Importación desde Excel y otros programas, con acta y botón de deshacer',
      'Asistente «Pregúntale a Tentare»: consulta datos y prepara clases, salas, eventos y citas con confirmación',
      'Gestión de instructoras, disponibilidad y sustituciones con tu visto bueno',
    ],
    audience: { '@type': 'Audience', audienceType: 'Estudios y centros de Pilates' },

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
        // La prueba (7 días, sin tarjeta) va en cada oferta, tal cual en /precios.
        description: `${plan.desc} Prueba gratuita de ${TRIAL_DIAS} días, sin tarjeta.`,
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

  // El vídeo real de producto del hero (components/landing/VideoProducto.tsx).
  // `uploadDate` es la fecha del commit que subió `tour.mp4` al repo
  // (`git log --follow --diff-filter=A -- public/producto/tour.mp4`), no una
  // fecha inventada — mismo criterio que el resto de fechas de este fichero.
  const videoObjectLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: 'Tentare por dentro: el panel de un estudio de Pilates en 78 segundos',
    description:
      'Tentare por dentro: bajas que se cubren solas, la semana entera en el calendario, reservas online y los cobros del mes.',
    thumbnailUrl: `${BASE_URL}/producto/tour-poster.jpg`,
    contentUrl: `${BASE_URL}/producto/tour.mp4`,
    uploadDate: '2026-09-17',
    duration: 'PT1M18S',
    publisher: { '@id': ID_ORGANIZACION },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoObjectLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}
