import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { ThemeStyle } from '@/components/theme-style';

// Vista previa del Inicio del portal para el editor de bloques (Fase 4 del
// editor de temas) — SIN PortalAuthProvider a propósito: quien abre esto es
// el panel de staff dentro de un iframe (token firmado, ver
// lib/theme/home-preview-token.ts), nunca una socia con sesión real. Mismo
// patrón que app/reservar/[slug]/layout.tsx (página pública sin auth de
// socia), no el de app/portal/[slug]/layout.tsx.
export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  return (
    <StudioSlugGate slug={slug} initialStudioId={studio?.id ?? null} initialResuelto>
      <ThemeStyle slug={slug} />
      {children}
    </StudioSlugGate>
  );
}
