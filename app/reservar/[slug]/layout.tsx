import type { Metadata } from 'next';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { metadatosPublicos } from '@/lib/theme/seo-publico';
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
    robots: { index: true, follow: true },
    ...(theme.faviconUrl ? { icons: { icon: theme.faviconUrl } } : {}),
  };
}

export default async function ReservarSlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
