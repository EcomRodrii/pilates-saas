// ─────────────────────────────────────────────────────────────────────────────
// El JSON-LD `FAQPage` de las páginas públicas, como función pura.
//
// Vive aquí y no dentro del componente (`FaqStructuredData`) para que un test de
// `npm test` pueda comprobar que el marcado que lee Google dice LO MISMO que lo
// que ve la visitante: ambos salen del mismo array `items`, pero ese hecho solo
// se puede fijar si el constructor es importable sin JSX.
// ─────────────────────────────────────────────────────────────────────────────

export interface PreguntaFaq {
  q: string;
  a: string;
}

export interface FaqPageLd {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: { '@type': 'Question'; name: string; acceptedAnswer: { '@type': 'Answer'; text: string } }[];
}

export function faqPageLd(items: readonly PreguntaFaq[]): FaqPageLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}
