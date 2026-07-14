import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { themeToCssText } from '@/lib/theme-runtime';

// Inyecta el tema PUBLICADO del estudio como CSS variables en un <style>
// renderizado en el SERVIDOR → llega en el HTML inicial, sin FOUC (flash sin
// tema). Reusa la consulta cacheada getStudioSeo(slug) de la metadata/layout.
// Los valores provienen de resolveTheme (hex validados), así que el CSS es
// seguro para dangerouslySetInnerHTML (no hay input libre que pueda romper `}`).
export async function ThemeStyle({ slug }: { slug: string }) {
  const studio = await getStudioSeo(slug);
  if (!studio) return null;
  const theme = await getThemePublicado(studio.id);
  return (
    <style id="studio-theme" dangerouslySetInnerHTML={{ __html: themeToCssText(theme, ':root') }} />
  );
}
