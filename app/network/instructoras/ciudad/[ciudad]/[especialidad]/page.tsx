import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';
import { esEspecialidadValida, ESPECIALIDAD_LABEL } from '@/lib/network/catalogo';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';

function ciudadDesdeParam(param: string): string {
  return decodeURIComponent(param).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FILTRO_BASE: Omit<FiltroBusquedaNetwork, 'ciudad' | 'especialidades'> = {
  disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [],
};

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string; especialidad: string }> }): Promise<Metadata> {
  const { ciudad, especialidad } = await params;
  const nombreCiudad = ciudadDesdeParam(ciudad);
  if (!esEspecialidadValida(especialidad)) return { title: 'Instructoras de Pilates' };
  const nombreEspecialidad = ESPECIALIDAD_LABEL[especialidad];
  return {
    title: `Instructoras de Pilates de ${nombreEspecialidad} en ${nombreCiudad}`,
    description: `Instructoras de Pilates especializadas en ${nombreEspecialidad} en ${nombreCiudad}, verificadas y disponibles.`,
  };
}

export default async function MarketplacePorCiudadYEspecialidadPage({
  params,
}: {
  params: Promise<{ ciudad: string; especialidad: string }>;
}) {
  const { ciudad, especialidad } = await params;
  if (!esEspecialidadValida(especialidad)) notFound();
  const nombreCiudad = ciudadDesdeParam(ciudad);
  return (
    <MarketplaceLayout
      filtro={{ ...FILTRO_BASE, ciudad: nombreCiudad, especialidades: [especialidad] }}
      tituloCiudad={nombreCiudad}
    />
  );
}
