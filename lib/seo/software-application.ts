import { PLANS } from '@/components/landing/data';
import { BASE_URL } from '@/lib/seo/paginas';
import { TODO_MENOS_SEDES, precioMesWeb } from '@/lib/landing/founding-gratis';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';

// UN solo nodo SoftwareApplication (`/#software`) para todo el sitio: lo pintan
// la home y /precios con ESTE mismo objeto. Antes cada una tenía el suyo con el
// mismo @id y datos distintos (el de /precios sin IVA, sin disponibilidad y con
// otro texto), y un buscador que lee las dos páginas ve una entidad que se
// contradice. Si cambia un plan, cambia en PLANS y aquí no hay nada que tocar.

/**
 * Las ofertas de schema.org de los tres planes. Cada plan con su periodo
 * (mensual, IVA incluido) y la página de precios: sin `unitCode`, una cifra no
 * dice si es al mes o para siempre, y los buscadores con IA citan justo eso.
 * Founding Studio es gratis desde el 15-oct-2026: precio 0, con sus límites en
 * la descripción (lib/landing/founding-gratis.ts).
 */
export function ofertasPlanesLd() {
  return PLANS.map((plan) => {
    const price = precioMesWeb(plan.id);
    return {
      '@type': 'Offer',
      name: plan.name,
      price,
      priceCurrency: 'EUR',
      description: plan.id === 'BASE' ? `${plan.desc} ${TODO_MENOS_SEDES}.` : plan.desc,
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
  });
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
      'Bonos, cuotas mensuales y cobros con tarjeta con reintento, y remesa SEPA para el banco',
      'Facturas con numeración legal',
      'Calendario por salas',
      'Importación desde Excel y otros programas, con acta y botón de deshacer',
      'Gestión de instructoras, disponibilidad y sustituciones con tu visto bueno',
    ],
    keywords: 'software para estudios de Pilates, software para estudios de yoga, programa para centros de Pilates y yoga',
    audience: { '@type': 'Audience', audienceType: 'Estudios y centros de Pilates y yoga' },

    // TODO: añadir `aggregateRating` ({ '@type': 'AggregateRating', ratingValue,
    // reviewCount }) en cuanto haya reseñas reales del SOFTWARE Tentare
    // (p. ej. G2/Capterra, o un módulo de testimonios propio) — nunca un valor
    // inventado, Google Rich Results lo penaliza. `lib/inngest/valoraciones.ts`
    // es un sistema distinto: valora las CLASES de cada estudio, no el producto.
    offers: ofertasPlanesLd(),
  };
}
