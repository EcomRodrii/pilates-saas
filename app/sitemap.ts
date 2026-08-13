import type { MetadataRoute } from 'next';
import { PAGINAS, urlDe, BASE_URL } from '@/lib/seo/paginas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

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
//
// Tentare Network añade entradas DINÁMICAS aparte del registro estático: un
// perfil publicado por instructora, con su `slug` real — nunca miles de
// páginas vacías generadas a priori (brief punto 12), solo las que existen
// de verdad. `getSupabaseAdmin()` puede ser `null` en build sin env vars
// (mismo patrón que el resto de rutas de Network); en ese caso el sitemap
// simplemente no lleva perfiles, no rompe el build.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = PAGINAS.map((p) => ({
    url: urlDe(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.prioridad,
    // Solo cuando la fecha es real. Ver el comentario de `actualizado` en el
    // registro: inventarla es peor que omitirla.
    ...(p.actualizado ? { lastModified: new Date(p.actualizado) } : {}),
  }));

  const admin = getSupabaseAdmin();
  if (!admin) return estaticas;

  const { data } = await admin
    .from('red_perfiles')
    .select('slug, actualizado_en')
    .eq('estado', 'published')
    .not('slug', 'is', null);

  const perfiles: MetadataRoute.Sitemap = (data ?? []).map((p) => ({
    url: `${BASE_URL}/network/instructoras/${p.slug as string}`,
    changeFrequency: 'monthly',
    priority: 0.6,
    lastModified: new Date(p.actualizado_en as string),
  }));

  return [...estaticas, ...perfiles];
}
