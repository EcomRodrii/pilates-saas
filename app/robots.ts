import type { MetadataRoute } from 'next';

const BASE_URL = 'https://tentare.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // A-18: zonas privadas que NO deben indexarse. Antes solo listaba
      // /dashboard, pero las páginas de gestión viven en la raíz del route-group
      // (dashboard) — /socios, /pagos, /configuracion… quedaban rastreables
      // (y sin middleware, el servidor devuelve su HTML 200 antes del redirect
      // de cliente). Se listan todos los segmentos del panel + el portal/kiosk.
      disallow: [
        '/api', '/login', '/crear-estudio', '/suscripcion',
        '/portal', '/kiosk',
        '/dashboard', '/centro-de-control', '/calendario', '/citas', '/socios', '/clientas',
        '/cobros', '/pagos', '/transacciones', '/facturas', '/informes', '/equipo',
        '/marketing', '/mensajeria', '/automatizaciones', '/notificaciones',
        '/comunidad', '/chat', '/pos', '/productos', '/ondemand', '/configuracion',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
