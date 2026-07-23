import type { MetadataRoute } from 'next';

const BASE_URL = 'https://tentare.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const legales = ['/legal', '/privacidad', '/terminos', '/cookies'].map((p) => ({
    url: `${BASE_URL}${p}`,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  }));
  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...legales,
  ];
}
