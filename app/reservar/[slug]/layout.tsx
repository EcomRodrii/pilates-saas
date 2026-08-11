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

// SEO server-rendered (I-9): título/descripción/Open Graph con el nombre y la
// ciudad del estudio, para que "pilates <ciudad> reservar" indexe contenido real
// en vez de una página en blanco de cliente.
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
  // ⚠️ `images` solo se pone cuando hay imagen. Un `images: [undefined]`
  // renderiza una etiqueta `og:image` vacía, que a algunos scrapers les gusta
  // menos que no tener ninguna.
  const imagenes = imagen ? { images: [imagen] } : {};
  return {
    title: titulo,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: 'website', locale: 'es_ES', ...imagenes },
    twitter: { card: tarjeta, title: titulo, description: descripcion, ...imagenes },
    // ⚠️ Una página oculta NO se indexa, pase lo que pase con la cookie. El
    // `noindex` va aquí y no en la rama que decide qué pintar porque Google
    // llega sin cookie: si dependiera del pase, un rastreo hecho justo antes
    // de ocultarla dejaría el contenido en el índice durante semanas.
    robots: studio.paginaOculta ? { index: false, follow: false } : { index: true, follow: true },
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
