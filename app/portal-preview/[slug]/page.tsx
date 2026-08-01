import { getStudioSeo } from '@/lib/studio-seo';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import { PortalPreviewHomeClient } from '@/components/portal/portal-preview-home-client';

export const metadata = { robots: { index: false, follow: false } };

// Sin token válido para ESTE estudio → placeholder, nunca el login (esta ruta
// no tiene formulario de login que mostrar: no monta PortalAuthProvider).
export default async function PortalPreviewHomePage({
  params, searchParams,
}: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const studio = await getStudioSeo(slug);
  const verificado = studio ? verificarTokenPreviewHome(t) : null;

  if (!verificado || verificado.studioId !== studio?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEEEE8] px-6 text-center">
        <p className="text-[13px] text-muted-foreground">Recarga la vista previa desde el editor.</p>
      </div>
    );
  }

  return <PortalPreviewHomeClient />;
}
