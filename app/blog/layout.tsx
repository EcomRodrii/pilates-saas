import type { Metadata } from 'next';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { URL_BLOG } from '@/lib/blog/autor';
import '@/components/blog/blog.css';

// El blog personal del fundador vive DENTRO de Tentare (misma isla, mismo pie, mismos tokens) pero con identidad
// editorial propia: ver components/blog/blog.css. El layout pone lo común —armazón, Organization y el RSS—; cada página
// declara su propio título, canonical y JSON-LD.
export const metadata: Metadata = {
  alternates: { types: { 'application/rss+xml': `${URL_BLOG}/feed.xml` } },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <IslaWeb />
      <div className="bl">{children}</div>
      <PieWeb />
    </PageShell>
  );
}
