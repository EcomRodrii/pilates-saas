import type { Metadata } from 'next';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { metadatosPublicos } from '@/lib/theme/seo-publico';
import { cookies } from 'next/headers';
import { veredictoPagina, nombreCookieAcceso } from '@/lib/publico/acceso-pagina';
import { PaginaOculta } from '@/components/publico/pagina-oculta';
import { ThemeStyle } from '@/components/theme-style';
import { ThemePreviewListener } from '@/components/theme/theme-preview-listener';

// Metadata server-rendered (I-9): título/descripción/Open Graph con el nombre y
// la ciudad del estudio. Sirve para lo que la socia comparte por WhatsApp y
// para los previsualizadores de enlaces — NO para buscadores (ver abajo).
//
// ⚠️ Estas páginas NO se indexan, por decisión de producto (2026-08-11): la
// prioridad de tentare.app es SEO B2B (propietarias buscando software), y abrir
// `/reservar/<slug>` generaría miles de URLs B2C locales, una por estudio, que
// compiten por consultas que no convierten en cliente de Tentare.
//
// Antes esto se contradecía consigo mismo: aquí se declaraba `index: true` y
// `app/robots.ts` prohibía `/reservar`. Google no puede rastrear para leer una
// etiqueta que le hemos prohibido ir a buscar, así que la etiqueta no hacía
// nada y la intención real quedaba sin escribir en ningún sitio.
//
// Ahora las dos puertas dicen lo mismo. El `noindex` es la segunda línea: si
// algún día se levanta el `disallow` de robots.txt —o un rastreador lo ignora—
// la página sigue diciendo que no se indexe. Para volver a abrirlas hay que
// tocar los DOS sitios a la vez, que es exactamente lo que se quiere.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  if (!studio) {
    return { title: 'Reservar clase de Pilates', robots: { index: false, follow: false } };
  }
  // Favicon del estudio (white-label) y su texto para compartir/buscadores,
  // si los tiene configurados en su tema.
  const theme = await getThemePublicado(studio.id);
  // El texto sale de una función pura y probada: mientras el estudio no
  // escriba lo suyo, es carácter por carácter el mismo que se indexaba antes
  // de que estos campos existieran.
  const { titulo, descripcion, imagen, tarjeta } = metadatosPublicos(studio, theme);
  // `imagen` ya nunca viene vacía: sin la del estudio entra la de por defecto,
  // relativa, que `metadataBase` (app/layout.tsx) convierte en absoluta. Antes
  // esto era condicional porque un `images: [undefined]` renderiza una etiqueta
  // `og:image` vacía, que a algunos scrapers les gusta menos que ninguna.
  const imagenes = { images: [imagen] };
  return {
    title: titulo,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: 'website', locale: 'es_ES', ...imagenes },
    twitter: { card: tarjeta, title: titulo, description: descripcion, ...imagenes },
    // Nunca indexable, esté la página oculta o no (ver cabecera). `follow: false`
    // porque los únicos enlaces que salen de aquí van al portal de la socia, que
    // también está fuera del índice.
    robots: { index: false, follow: false },
    ...(theme.faviconUrl ? { icons: { icon: theme.faviconUrl } } : {}),
  };
}

export default async function ReservarSlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const visitante = await getStudioSeo(slug);

  // El gate va en el LAYOUT del servidor, antes de montar nada: así el HTML
  // que sale por el cable no contiene la página, en vez de pintarla y taparla
  // con un cartel que cualquiera quita desde el inspector.
  //
  // ⚠️ Esto oculta la PÁGINA, no los datos — la API pública del estudio sigue
  // respondiendo. Es lo que se pidió («que no se vea todavía») y lo que se
  // puede prometer; la cerradura de los datos en este repo es siempre la RLS.
  if (visitante?.paginaOculta) {
    const galleta = await cookies();
    const veredicto = veredictoPagina({
      oculta: true,
      tieneClave: visitante.paginaTieneClave,
      pase: galleta.get(nombreCookieAcceso(visitante.id))?.value,
      studioId: visitante.id,
    });
    if (veredicto !== 'abierta') {
      return <PaginaOculta nombre={visitante.nombre} slug={slug} pideClave={veredicto === 'pide-clave'} />;
    }
  }
  // Resolvemos el estudio en el SERVIDOR (misma consulta cacheada que la
  // metadata): el gate monta el StudioProvider al instante, sin round-trip de
  // cliente ni el flash en blanco previo.
  const studio = await getStudioSeo(slug);
  return (
    <StudioSlugGate slug={slug} initialStudioId={studio?.id ?? null} initialResuelto>
      <ThemeStyle slug={slug} />
      <ThemePreviewListener />
      {children}
    </StudioSlugGate>
  );
}
