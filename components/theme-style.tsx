import { getStudioSeo } from '@/lib/studio-seo';
import { getThemePublicado } from '@/lib/theme-data';
import { themeToCssText, varsKitDelTema } from '@/lib/theme-runtime';
import { paletaPortalCssText } from '@/lib/portal-paleta';

// Inyecta el tema PUBLICADO del estudio como CSS variables en un <style>
// renderizado en el SERVIDOR → llega en el HTML inicial, sin FOUC (flash sin
// tema). Reusa la consulta cacheada getStudioSeo(slug) de la metadata/layout.
// Los valores provienen de resolveTheme (hex validados), así que el CSS es
// seguro para dangerouslySetInnerHTML (no hay input libre que pueda romper `}`).
//
// Va primero la paleta neutra del portal y DESPUÉS el tema del estudio, para
// que el color de marca gane si algún día ambos declararan la misma variable.
export async function ThemeStyle({ slug }: { slug: string }) {
  const studio = await getStudioSeo(slug);
  if (!studio) return null;
  const theme = await getThemePublicado(studio.id);

  // ⚠️ Segundo bloque, y no una línea más en el primero, porque los dos
  // portales no comparten vocabulario NI especificidad.
  //
  // El portal de siempre lee `--portal-brand`, `--portal-radius-card`,
  // `--portal-text-saludo`. El kit en React lee `--brand`, `--radius-card`,
  // `--size-greeting`, y sus valores los pone su fichero de tema bajo
  // `html[data-theme="…"]` — que GANA a `:root`. Medido en el navegador:
  // inyectar `:root{--brand:red}` no movía nada. O sea que la propietaria
  // cambiaba el color en Apariencia, lo veía cambiar en la vista previa (que
  // monta el portal VIEJO) y sus socias seguían viendo el de fábrica.
  //
  // `:root:root` (0-2-0) gana a `html[data-theme="…"]` (0-1-1) sin recurrir a
  // `!important`, y no depende del atributo: `data-theme` lo pone un efecto de
  // cliente, así que un selector que lo exigiera dejaría el primer pintado sin
  // tintar.
  const kit = varsKitDelTema(theme);

  return (
    <>
      <style id="studio-theme" dangerouslySetInnerHTML={{ __html: `${paletaPortalCssText()}\n${themeToCssText(theme, ':root')}` }} />
      {kit ? <style id="studio-theme-kit" dangerouslySetInnerHTML={{ __html: kit }} /> : null}
    </>
  );
}
