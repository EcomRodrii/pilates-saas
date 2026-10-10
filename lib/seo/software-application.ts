import { PLANS } from '@/components/landing/data';
import { BASE_URL } from '@/lib/seo/paginas';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';

// UN solo nodo SoftwareApplication (`/#software`) para todo el sitio: lo pintan
// la home y /precios con ESTE mismo objeto. Antes cada una tenía el suyo con el
// mismo @id y datos distintos (el de /precios sin IVA, sin la prueba de 7 días
// ni disponibilidad, y con otro texto), y un buscador que lee las dos páginas
// ve una entidad que se contradice. Si cambia un plan, cambia en PLANS y aquí
// no hay nada que tocar.
function planPriceToNumber(price: string): number {
  return Number(price.replace('€', ''));
}

export function softwareApplicationLd() {
  return {
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
      'Software para estudios y centros de Pilates y yoga en España: reservas online y lista de espera, app con la marca del estudio para las alumnas, bonos, cuotas y cobros, calendario por salas y gestión del equipo.',
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
    keywords: 'software para estudios de Pilates, software para estudios de yoga, programa para centros de Pilates y yoga',
    audience: { '@type': 'Audience', audienceType: 'Estudios y centros de Pilates y yoga' },

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
}
