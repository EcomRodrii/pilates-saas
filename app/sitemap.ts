import type { MetadataRoute } from 'next';
import { PAGINAS, urlDe, BASE_URL } from '@/lib/seo/paginas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { ciudadesIndexables, slugCiudadUrl } from '@/lib/network/publico';
import { slugsEstudiosIndexables } from '@/lib/seo/estudio-indexable-servidor';
import { ARTICULOS, CATEGORIAS, urlArticulo } from '@/lib/ayuda/registro';
import { imagenesSitemap } from '@/lib/recursos/schema';

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
  const estaticas: MetadataRoute.Sitemap = PAGINAS.map((p) => {
    // La portada de cada guía de /recursos (sitemap de imágenes). Solo las
    // guías tienen: el resto de páginas no lleva una imagen propia que indexar.
    const images = imagenesSitemap(p.path);
    return {
      url: urlDe(p.path),
      changeFrequency: p.changeFrequency,
      priority: p.prioridad,
      // Solo cuando la fecha es real. Ver el comentario de `actualizado` en el
      // registro: inventarla es peor que omitirla.
      ...(p.actualizado ? { lastModified: new Date(p.actualizado) } : {}),
      ...(images.length ? { images } : {}),
    };
  });

  // Categorías y artículos del Centro de Ayuda: rutas dinámicas
  // (app/ayuda/[categoria], app/ayuda/[categoria]/[articulo]) que no pasa el
  // barrido estático de lib/seo/paginas.ts — se derivan aquí directamente del
  // mismo registro que alimenta esas páginas, para no mantener una lista aparte.
  //
  // ⚠️ Se calculan ANTES del early return de abajo A PROPÓSITO. Son contenido
  // estático que no consulta nada, y colgaban del cliente de servicio: sin esa
  // clave, el sitemap perdía las 14 categorías y todos los artículos sin que
  // fallara nada ni se notara. Lo que necesita la base de datos son los perfiles
  // de Network y las páginas de estudio, y solo eso debe caerse con ella.
  const paginasCategoriaAyuda: MetadataRoute.Sitemap = CATEGORIAS.map((c) => ({
    url: `${BASE_URL}/ayuda/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
  const paginasArticuloAyuda: MetadataRoute.Sitemap = ARTICULOS
    .filter((a) => a.estado === 'publicado')
    .map((a) => ({
      url: `${BASE_URL}${urlArticulo(a)}`,
      changeFrequency: 'monthly',
      priority: 0.7,
      lastModified: new Date(a.actualizado),
    }));

  const admin = getSupabaseAdmin();
  if (!admin) return [...estaticas, ...paginasCategoriaAyuda, ...paginasArticuloAyuda];

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

  // Páginas de reserva de cada estudio, abiertas a indexación el 2026-08-17
  // (decisión del fundador). URL LIMPIA, sin parámetros: la misma que declara
  // el `canonical` del layout. Sin `lastModified`: la única fecha disponible
  // sería `creado_en`, falsa para un horario que cambia cada semana.
  //
  // ⚠️ Solo los estudios REALES y EN USO, con la misma regla que el `robots` de
  // la página (lib/seo/estudio-indexable.ts). Hasta el 25-sep-2026 bastaba con
  // tener una clase futura, y eso metía en el sitemap la demo del equipo y
  // pruebas caducadas con cientos de clases y ninguna alumna.
  const paginasEstudio: MetadataRoute.Sitemap = (await slugsEstudiosIndexables(admin)).map((slug) => ({
    url: `${BASE_URL}/reservar/${slug}`,
    // El horario cambia cada semana: es de lo más vivo que hay en el sitio.
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // Solo ciudad SOLA, no ciudad×especialidad todavía: sin volumen real de
  // perfiles por ciudad hoy no se justifica fragmentar más el sitemap (ver
  // comentario de slugCiudadUrl sobre por qué esta lista sale de perfiles
  // reales, no de un catálogo fijo).
  // Solo las ciudades que la propia página declara indexables (umbral de
  // perfiles): el sitemap ofrecía `/ciudad/barcelona` con un solo perfil, y la
  // página respondía noindex — «URL enviada marcada como noindex» en Search Console.
  const ciudades = await ciudadesIndexables(admin);
  const paginasCiudad: MetadataRoute.Sitemap = ciudades.map((ciudad) => ({
    url: `${BASE_URL}/network/instructoras/ciudad/${encodeURIComponent(slugCiudadUrl(ciudad))}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  return [...estaticas, ...perfiles, ...paginasCiudad, ...paginasEstudio, ...paginasCategoriaAyuda, ...paginasArticuloAyuda];
}
