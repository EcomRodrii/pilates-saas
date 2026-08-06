import type { MetadataRoute } from 'next';

const BASE_URL = 'https://tentare.app';

// Anclas de app/page.tsx con intención de búsqueda propia (precio, FAQ...).
// No son URLs distintas de verdad —la landing es una sola página—, pero
// listarlas ayuda a Google a entender la estructura interna y a elegir
// jump-links (sitelinks) para la home. Si algún día se separan en rutas
// reales, esta lista se sustituye por esas.
const ANCLAS_LANDING = ['#precio', '#faq', '#sustituciones', '#migracion'];

// Guías reales de /recursos/<slug> (páginas indexables de verdad, a
// diferencia de las anclas de arriba). Añadir aquí cada vez que se publique
// una guía nueva bajo app/recursos/.
const GUIAS_RECURSOS = [
  'cubrir-baja-instructora',
  'facturacion-electronica-verifactu',
  'precios-reformer-mat',
  'estudios-pilates-de-exito',
  'ocupacion-clases-valle',
  'reducir-cancelaciones-ultima-hora',
  'checklist-elegir-software-estudio',
];

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
  const guias = GUIAS_RECURSOS.map((slug) => ({
    url: `${BASE_URL}/recursos/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/recursos`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...guias,
    ...anclas,
    ...legales,
  ];
}
