import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { themeToCssText } from '@/lib/theme-runtime';
import { paletaPortalCssText } from '@/lib/portal-paleta';

// Inyecta el tema PUBLICADO del estudio como CSS variables en un <style>
// renderizado en el SERVIDOR → llega en el HTML inicial, sin FOUC (flash sin
// tema). Reusa la consulta cacheada getStudioSeo(slug) de la metadata/layout.
// Los valores provienen de resolveTheme (hex validados), así que el CSS es
// seguro para dangerouslySetInnerHTML (no hay input libre que pueda romper `}`).
//
// Va primero la paleta neutra del portal y DESPUÉS el tema del estudio, para
// que el color de marca gane si algún día ambos declararan la misma variable.
//
// `paletaCssText`: qué neutros (`--portal-bg`/`-surface`/`-ink`...) usar de
// base. Por defecto `paletaPortalCssText` (la del portal PRIVADO de la
// clienta) — cero cambio para `/portal/[slug]` y `/portal-preview/[slug]`.
// `/reservar/[slug]/layout.tsx` pasa `paletaReservarCssText`: es un contexto
// de marca distinto a propósito (`.claude/tentare-os.md` "Arquitectura de
// marca"), con su propia paleta desde el rediseño de 2026-08-26.
export async function ThemeStyle({ slug, paletaCssText = paletaPortalCssText }: { slug: string; paletaCssText?: () => string }) {
  const studio = await getStudioSeo(slug);
  if (!studio) return null;
  const theme = await getThemePublicado(studio.id);

  return (
    <style id="studio-theme" dangerouslySetInnerHTML={{ __html: `${paletaCssText()}\n${themeToCssText(theme, ':root')}` }} />
  );
}
