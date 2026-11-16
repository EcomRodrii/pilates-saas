import type { Metadata } from 'next';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
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
  openGraph: { siteName: 'Tentare', type: 'website', title: pagina.titulo, description: pagina.descripcion, url: urlDe('/academy') },
};

export default async function AcademyPage() {
  const videos = [...(await videosPublicados()).values()];
  return (
    <PageShell>
      <OrganizationStructuredData />
      <IslaWeb />
      <EscaparateAcademy videos={videos} />
      <PieWeb />
    </PageShell>
  );
}
