import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Datos mínimos del estudio para SEO y primer paint de la página pública (I-9).
// Se resuelve en el SERVIDOR y se cachea por request con React cache, de modo
// que generateMetadata y el layout comparten una única consulta.
export interface StudioSeo {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  colorPrimario: string;
  slug: string;
}

export const getStudioSeo = cache(async (slug: string): Promise<StudioSeo | null> => {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('studios')
    .select('id, nombre, ciudad, direccion, color_primario, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nombre: data.nombre ?? 'Estudio de Pilates',
    ciudad: data.ciudad ?? '',
    direccion: data.direccion ?? '',
    colorPrimario: data.color_primario ?? '#1A1A1A',
    slug: data.slug ?? slug,
  };
});
