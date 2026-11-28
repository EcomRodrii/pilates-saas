import type { Metadata } from 'next';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { EscaparateAcademy } from '@/components/academy/EscaparateAcademy';
import { videosPublicados } from '@/lib/ayuda/videos-servidor';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// Tentare Academy, el ESCAPARATE público (components/academy/EscaparateAcademy.tsx): la formación de verdad vive dentro del panel. Los vídeos se publican desde
// /interno/ayuda sin desplegar: la página se regenera cada pocos minutos y, al guardar un vídeo, al momento.
export const revalidate = 300;

const pagina = paginaDe('/academy')!;
export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe('/academy') },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe('/academy'),
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Tentare Academy' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: pagina.titulo,
    description: pagina.descripcion,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Tentare Academy' }],
  },
};

export default async function AcademyPage() {
  const videos = [...(await videosPublicados()).values()];
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path="/academy" name="Tentare Academy" />
      <IslaWeb />
      <EscaparateAcademy videos={videos} />
      <PieWeb />
    </PageShell>
  );
}
