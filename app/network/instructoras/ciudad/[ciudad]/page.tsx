import type { Metadata } from 'next';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';

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
  especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null,
};

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string }> }): Promise<Metadata> {
  const { ciudad } = await params;
  const nombre = ciudadDesdeParam(ciudad);
  return {
    title: `Instructoras de Pilates en ${nombre} | Tentare Network`,
    description: `Encuentra instructoras de Pilates verificadas en ${nombre}. Filtra por especialidad y disponibilidad, contacta directamente.`,
  };
}

export default async function MarketplacePorCiudadPage({ params }: { params: Promise<{ ciudad: string }> }) {
  const { ciudad } = await params;
  const nombre = ciudadDesdeParam(ciudad);
  return <MarketplaceLayout filtro={{ ...FILTRO_BASE, ciudad: nombre }} tituloCiudad={nombre} />;
}
