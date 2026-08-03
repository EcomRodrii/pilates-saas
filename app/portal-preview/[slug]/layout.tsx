import { StudioSlugGate } from '@/components/studio-slug-gate';
import { getStudioSeo } from '@/lib/studio-seo';
import { ThemeStyle } from '@/components/theme-style';
import { ThemePreviewListener } from '@/components/theme/theme-preview-listener';

// Vista previa de la app de socias para el editor de temas (colores/tipografía
// Y bloques del Inicio) — SIN PortalAuthProvider a propósito: quien abre esto es
// el panel de staff dentro de un iframe (token firmado, ver
// lib/theme/home-preview-token.ts), nunca una socia con sesión real. Mismo
// patrón que app/reservar/[slug]/layout.tsx (página pública sin auth de
// socia), no el de app/portal/[slug]/layout.tsx.
//
// ThemePreviewListener: antes solo escuchaba en /reservar/[slug], así que un
// color en borrador (pestaña "Marca y colores") no se veía aquí — la
// propietaria solo podía comprobarlo en la reserva pública, nunca en Inicio,
// Clases o Bonos. Con esto, cualquier pantalla montada bajo este layout
// refleja el mismo borrador de CSS vars.
export const metadata = { robots: { index: false, follow: false } };

export default async function PortalPreviewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const studio = await getStudioSeo(slug);
  return (
    <StudioSlugGate slug={slug} initialStudioId={studio?.id ?? null} initialResuelto>
      <ThemeStyle slug={slug} />
      <ThemePreviewListener />
      {children}
    </StudioSlugGate>
  );
}
