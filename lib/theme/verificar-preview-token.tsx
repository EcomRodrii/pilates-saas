import { getStudioSeo } from '@/lib/studio-seo';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';

// Comprobación compartida por TODAS las page.tsx de /portal-preview/[slug]/*
// (Inicio, Clases, Bonos...) — antes vivía duplicada en cada page.tsx. El
// token es genérico ({studioId, exp}, sin ligar a una pantalla concreta), así
// que un único token sirve para cualquier ruta de este árbol.
export async function tokenPreviewValido(slug: string, t: string | undefined): Promise<boolean> {
  const studio = await getStudioSeo(slug);
  const verificado = studio ? verificarTokenPreviewHome(t) : null;
  return !!verificado && verificado.studioId === studio?.id;
}

// Sin token válido para ESTE estudio → placeholder, nunca el login (esta
// ruta no tiene formulario de login que mostrar: no monta PortalAuthProvider).
export function PlaceholderPreview() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEEEE8] px-6 text-center">
      <p className="text-[13px] text-muted-foreground">Recarga la vista previa desde el editor.</p>
    </div>
  );
}
