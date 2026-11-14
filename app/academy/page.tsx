import type { Metadata } from 'next';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { PortadaAcademy } from '@/components/academy/PortadaAcademy';
import { videosPublicados } from '@/lib/ayuda/videos-servidor';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// Tentare Academy: la portada de aprendizaje sobre las guías del Centro de ayuda (lib/ayuda/academy.ts). Los vídeos se publican desde
// /interno/ayuda sin desplegar: la página se regenera cada pocos minutos y, al guardar un vídeo, al momento.
export const revalidate = 300;

const pagina = paginaDe('/academy')!;
export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe('/academy') },
  openGraph: { siteName: 'Tentare', type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe('/academy') },
};

export default async function AcademyPage() {
  const videos = [...(await videosPublicados()).values()];
  return (
    <PageShell>
      <OrganizationStructuredData />
      <IslaWeb />
      <PortadaAcademy videos={videos} />
      <PieWeb />
    </PageShell>
  );
}
