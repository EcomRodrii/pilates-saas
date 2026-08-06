import type { MetadataRoute } from 'next';

const BASE_URL = 'https://tentare.app';

// Anclas de app/page.tsx con intención de búsqueda propia (precio, FAQ...).
// No son URLs distintas de verdad —la landing es una sola página—, pero
// listarlas ayuda a Google a entender la estructura interna y a elegir
// jump-links (sitelinks) para la home. Si algún día se separan en rutas
// reales, esta lista se sustituye por esas.
const ANCLAS_LANDING = ['#precio', '#faq', '#sustituciones', '#migracion'];

export default function sitemap(): MetadataRoute.Sitemap {
  const legales = ['/legal', '/privacidad', '/terminos', '/cookies'].map((p) => ({
    url: `${BASE_URL}${p}`,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  }));
  const anclas = ANCLAS_LANDING.map((hash) => ({
    url: `${BASE_URL}/${hash}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));
  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...anclas,
    ...legales,
  ];
}
