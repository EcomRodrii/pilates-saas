import { FAQ_ITEMS } from './data';
import { softwareApplicationLd as softwareApplicationLdCompartido } from '@/lib/seo/software-application';
import { BASE_URL } from '@/lib/seo/paginas';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';

export function StructuredData() {
  const softwareApplicationLd = softwareApplicationLdCompartido();

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
