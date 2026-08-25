import type { Metadata } from 'next';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
import { LEGAL } from '@/lib/legal-info';

// Variante SEO del marketplace por ciudad (README: "MISMO layout, título
// dinámico «Instructoras de Pilates en {Ciudad}»"). Bajo /ciudad/ y no
// directamente /network/instructoras/[ciudad]: esa forma choca con
// /network/instructoras/[slug] (perfil público) — Next.js no admite dos
// nombres de segmento dinámico distintos al mismo nivel de ruta. El prefijo
// estático desambigua sin perder legibilidad ni indexabilidad.
function ciudadDesdeParam(param: string): string {
  return decodeURIComponent(param).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FILTRO_BASE: Omit<FiltroBusquedaNetwork, 'ciudad'> = {
  especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null,
};

// Guardia de indexación (P1 de la auditoría 2026-08-25): esta ruta acepta
// cualquier ciudad en la URL, real o no — sin este guardia, Google indexa
// páginas 200 vacías para cualquier combinación, lo que diluye el resto del
// dominio a ojos del buscador. Un noindex/nofollow cuando no hay ningún
// resultado real es más barato y más correcto que intentar enumerar de
// antemano qué ciudades tienen contenido (generateStaticParams no sirve
// aquí: la lista de ciudades reales crece con cada perfil publicado).
async function hayResultadosReales(nombreCiudad: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const resultado = await buscarPerfilesPublico(admin, { ...FILTRO_BASE, ciudad: nombreCiudad });
  return 'perfiles' in resultado && resultado.perfiles.length > 0;
}

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string }> }): Promise<Metadata> {
  const { ciudad } = await params;
  const nombre = ciudadDesdeParam(ciudad);
  const indexable = await hayResultadosReales(nombre);
  return {
    title: `Instructoras de Pilates y Yoga en ${nombre}`,
    description: `Encuentra instructoras de Pilates y Yoga verificadas en ${nombre}. Filtra por especialidad y disponibilidad, contacta directamente.`,
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function MarketplacePorCiudadPage({ params }: { params: Promise<{ ciudad: string }> }) {
  const { ciudad } = await params;
  const nombre = ciudadDesdeParam(ciudad);
  return (
    <MarketplaceLayout
      filtro={{ ...FILTRO_BASE, ciudad: nombre }}
      tituloCiudad={nombre}
      migasPan={[
        { name: 'Instructoras', item: `${LEGAL.url}/network/instructoras` },
        { name: nombre, item: `${LEGAL.url}/network/instructoras/ciudad/${ciudad}` },
      ]}
    />
  );
}
