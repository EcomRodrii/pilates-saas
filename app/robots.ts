import type { MetadataRoute } from 'next';
import { BASE_URL, PREFIJOS_NO_INDEXABLES, EXCEPCIONES_INDEXABLES } from '@/lib/seo/paginas';

// La lista de `disallow` sale del registro (PREFIJOS_NO_INDEXABLES), no de una
// copia a mano.
//
// A-18 ya había arreglado el fallo grande —las páginas del panel viven en la
// RAÍZ del route-group `(dashboard)`, así que su URL es `/socios`, `/cobros`…,
// no `/dashboard/socios`— pero la lista se escribió a mano y se quedó corta:
// `/cierre`, `/contenido`, `/explorar-funciones`, `/libreta`, `/mi-perfil`,
// `/migracion`, `/primeros-pasos` y `/sustituciones` seguían rastreables, igual
// que las páginas de enlace firmado (`/valorar/<token>`, `/no-puedo/<token>`…).
// Ahora la lista es la misma que usa el test de cobertura, así que un segmento
// nuevo del panel no puede quedarse fuera sin que `npm test` lo cante.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // El orden importa poco para Google (gana la regla más específica,
      // no la última), pero para crawlers menos estrictos si — `allow` va
      // DESPUÉS del `disallow` que lo contiene, mismo criterio que
      // esNoIndexable() en lib/seo/paginas.ts.
      allow: ['/', ...EXCEPCIONES_INDEXABLES],
      disallow: [...PREFIJOS_NO_INDEXABLES],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
