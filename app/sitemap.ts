import type { MetadataRoute } from 'next';
import { PAGINAS, urlDe, BASE_URL } from '@/lib/seo/paginas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { ciudadesConPerfilesPublicados, slugCiudadUrl } from '@/lib/network/publico';
import { ARTICULOS, CATEGORIAS, urlArticulo } from '@/lib/ayuda/registro';

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

  // Páginas de reserva de cada estudio, abiertas a indexación el 2026-08-17
  // (ver lib/seo/paginas.ts y app/reservar/[slug]/layout.tsx).
  //
  // Con `slug` real y SOLO las publicadas: una página que la propietaria tiene
  // OCULTA mientras la prepara no es contenido, y el layout la sustituye por la
  // pantalla de acceso — ofrecérsela a Google sería ofrecerle el cartel.
  // Mismo criterio que los perfiles de Network: nunca miles de URLs generadas a
  // priori, solo las que existen de verdad.
  //
  // La URL es la LIMPIA, sin parámetros: es la misma que declara el `canonical`
  // del layout, y las dos tienen que decir lo mismo o Google elige por su
  // cuenta cuál se queda.
  // ⚠️ La columna es `pagina_publica_oculta`, no `pagina_oculta`, y `studios` NO
  // tiene `actualizado_en`. Importa más de lo que parece: PostgREST no ignora
  // una columna inexistente, RECHAZA LA CONSULTA ENTERA con un 400 — así que un
  // nombre mal puesto aquí no da un sitemap incompleto, da un sitemap sin UN
  // SOLO estudio, en silencio (mismo motivo por el que `getStudioSeo` pide estas
  // columnas en una consulta aparte). Comprobado contra el esquema real.
  //
  // Sin `lastModified`: la única fecha disponible sería `creado_en`, que para un
  // horario que cambia cada semana es sencillamente falsa. Mismo criterio que el
  // registro estático — inventarla es peor que omitirla.
  // ⚠️ **Solo estudios con clases de verdad.** Medido el 2026-08-17: de 12
  // estudios con slug, DIEZ tenían cero clases futuras, y sus nombres son `a`,
  // `POR`, `cami`, `TENTARE`, `teTENTARE`… — cuentas de prueba del propio
  // desarrollo. Mandarlas al sitemap pondría páginas tituladas «POR» y «a» en
  // el índice de Google bajo tentare.app: contenido delgado, que Google penaliza
  // y que además se ve fatal para quien busque la marca.
  //
  // El criterio es "tiene al menos una clase futura sin cancelar", que es
  // exactamente lo que hace que la página tenga algo que enseñar. Un estudio
  // real que se quede sin horario sale del sitemap solo, y vuelve cuando
  // programa; la página nunca deja de ser indexable, simplemente no se ofrece.
  const [{ data: estudios }, { data: conClases }] = await Promise.all([
    admin.from('studios').select('id, slug, pagina_publica_oculta').not('slug', 'is', null),
    // Sin `distinct` (PostgREST no lo expone): se traen los studio_id y se
    // deduplican aquí. El límite es alto a propósito y el orden explícito —un
    // truncado silencioso a 1000 filas dejaría estudios fuera sin avisar.
    admin.from('sesiones').select('studio_id')
      .gt('inicio', new Date().toISOString())
      .or('cancelada.is.null,cancelada.eq.false')
      .order('studio_id')
      .limit(20000),
  ]);

  const estudiosConClases = new Set((conClases ?? []).map((s) => s.studio_id as string));

  const paginasEstudio: MetadataRoute.Sitemap = (estudios ?? [])
    .filter((e) => e.pagina_publica_oculta !== true && estudiosConClases.has(e.id as string))
    .map((e) => ({
      url: `${BASE_URL}/reservar/${e.slug as string}`,
      // El horario cambia cada semana: es de lo más vivo que hay en el sitio.
      changeFrequency: 'daily',
      priority: 0.7,
    }));

  // Solo ciudad SOLA, no ciudad×especialidad todavía: sin volumen real de
  // perfiles por ciudad hoy no se justifica fragmentar más el sitemap (ver
  // comentario de slugCiudadUrl sobre por qué esta lista sale de perfiles
  // reales, no de un catálogo fijo).
  const ciudades = await ciudadesConPerfilesPublicados(admin);
  const paginasCiudad: MetadataRoute.Sitemap = ciudades.map((ciudad) => ({
    url: `${BASE_URL}/network/instructoras/ciudad/${encodeURIComponent(slugCiudadUrl(ciudad))}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }));

  // Categorías y artículos del Centro de Ayuda: rutas dinámicas
  // (app/ayuda/[categoria], app/ayuda/[categoria]/[articulo]) que no pasa el
  // barrido estático de lib/seo/paginas.ts — se derivan aquí directamente del
  // mismo registro que alimenta esas páginas, para no mantener una lista aparte.
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

  return [...estaticas, ...perfiles, ...paginasCiudad, ...paginasEstudio, ...paginasCategoriaAyuda, ...paginasArticuloAyuda];
}
