import type { MetadataRoute } from 'next';
import { PAGINAS, urlDe } from '@/lib/seo/paginas';

// El sitemap se DERIVA del registro (lib/seo/paginas.ts); aquí no se mantiene
// ninguna lista.
//
// Antes había tres listas a mano y las tres se desincronizaron:
//  · las 7 páginas de /comparativa/tentare-vs-* nunca llegaron a entrar,
//  · se listaban anclas de la home (`/#precio`, `/#faq`…) que Google normaliza
//    quitando el fragmento — cuatro entradas duplicadas de `/`, no cuatro URLs
//    (los sitelinks ya los sugiere el SiteNavigationElement de
//    components/OrganizationStructuredData.tsx, que es donde corresponde),
//  · y no había `lastModified` en ninguna entrada.
// `lib/seo/paginas.test.ts` falla si aparece una página pública sin registrar.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGINAS.map((p) => ({
    url: urlDe(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.prioridad,
    // Solo cuando la fecha es real. Ver el comentario de `actualizado` en el
    // registro: inventarla es peor que omitirla.
    ...(p.actualizado ? { lastModified: new Date(p.actualizado) } : {}),
  }));
}
