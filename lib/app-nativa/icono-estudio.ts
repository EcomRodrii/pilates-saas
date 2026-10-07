import 'server-only';
import { getThemePublicado } from '@/lib/theme-data';
import { colorMarcaDelEstudio } from '@/lib/emails/color-marca';
import { urlIconoEstudio } from '@/lib/monograma-estudio';

// El icono con el que la alumna reconoce a su estudio en la entrada de la app
// (lista de sus estudios, buscador y ficha): su favicon si lo ha subido, si no su
// logo, y si no la inicial en SU color de marca. Favicon y color salen del tema
// publicado, no de la columna `color_primario`, que nadie vuelve a editar tras el
// alta (mismo orden que la app del estudio, lib/studio-seo.ts).

export interface EstudioParaIcono {
  id: string;
  nombre: string | null;
  logo_url: string | null;
  color_primario: string | null;
}

/**
 * El icono y el color de marca con el que se pinta su inicial. La lista los
 * necesita los dos: el icono es una imagen que tarda en llegar (o no llega), y
 * mientras tanto el hueco enseña la inicial sobre ESTE color (`AvatarEstudio`),
 * no un cuadrado vacío.
 */
export async function marcaDelEstudio(e: EstudioParaIcono, size: 192 | 512 = 192): Promise<{ icono: string; color: string | null }> {
  const tema = await getThemePublicado(e.id).catch(() => null);
  const color = colorMarcaDelEstudio(tema?.primary, null, e.color_primario);
  const icono = urlIconoEstudio(
    e.nombre, color, size,
    { iconoUrl: tema?.faviconUrl ?? null, logoUrl: e.logo_url },
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  );
  return { icono, color };
}
