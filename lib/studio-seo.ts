import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Datos mínimos del estudio para SEO y primer paint de la página pública (I-9).
// Se resuelve en el SERVIDOR y se cachea por request con React cache, de modo
// que generateMetadata y el layout comparten una única consulta.
export interface StudioSeo {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string;
  colorPrimario: string;
  logoUrl: string | null;
  slug: string;
}

export const getStudioSeo = cache(async (slug: string): Promise<StudioSeo | null> => {
  // Semilla E2E (B0.3): esta resolución ocurre en el SERVIDOR, así que el mock de
  // red de Playwright (nivel navegador) no la intercepta; con el env dummy de CI
  // devolvería null y la página pública mostraría "estudio no encontrado", lo que
  // mantenía la suite E2E en cuarentena (describe.skip). Con E2E_TEST=1 se siembra
  // el estudio de prueba en el servidor. NUNCA se activa en producción (la env no
  // existe allí); coincide con el fixture de e2e/booking.spec.ts.
  if (process.env.E2E_TEST === '1') {
    return { id: 'studio-test', nombre: 'Tentare', ciudad: 'Málaga', direccion: 'Calle Test 1', colorPrimario: '#1A1A1A', logoUrl: null, slug };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('studios')
    .select('id, nombre, ciudad, direccion, color_primario, logo_url, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nombre: data.nombre ?? 'Estudio de Pilates',
    ciudad: data.ciudad ?? '',
    direccion: data.direccion ?? '',
    colorPrimario: data.color_primario ?? '#1A1A1A',
    logoUrl: data.logo_url ?? null,
    slug: data.slug ?? slug,
  };
});
