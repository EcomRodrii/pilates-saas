import type { Metadata } from 'next';
import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { ThemeStyle } from '@/components/theme-style';

// SEO server-rendered (I-9): título/descripción/Open Graph con el nombre y la
// ciudad del estudio, para que "pilates <ciudad> reservar" indexe contenido real
// en vez de una página en blanco de cliente.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  if (!studio) {
    return { title: 'Reservar clase de Pilates', robots: { index: false, follow: false } };
  }
  const enCiudad = studio.ciudad ? ` en ${studio.ciudad}` : '';
  const title = `${studio.nombre} — Reserva tu clase de Pilates${enCiudad}`;
  const description = `Reserva online tu clase de Pilates reformer en ${studio.nombre}${studio.ciudad ? ` (${studio.ciudad})` : ''}. Elige día, hora y tu sitio en segundos.`;
  // Favicon del estudio (white-label) si lo tiene configurado en su tema.
  const theme = await getThemePublicado(studio.id);
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', locale: 'es_ES' },
    twitter: { card: 'summary', title, description },
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
      {children}
    </StudioSlugGate>
  );
}
