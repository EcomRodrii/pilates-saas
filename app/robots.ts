import type { MetadataRoute } from 'next';

const BASE_URL = 'https://tentare.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Zonas privadas: paneles de gestión y portales de socias no deben indexarse.
      disallow: ['/dashboard', '/portal', '/kiosk', '/crear-estudio', '/login', '/api'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
