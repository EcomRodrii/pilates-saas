import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';
import { esEspecialidadValida, ESPECIALIDAD_LABEL, DISCIPLINA_DE_ESPECIALIDAD, DISCIPLINA_LABEL } from '@/lib/network/catalogo';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
import { LEGAL } from '@/lib/legal-info';

function ciudadDesdeParam(param: string): string {
  return decodeURIComponent(param).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const FILTRO_BASE: Omit<FiltroBusquedaNetwork, 'ciudad' | 'especialidades'> = {
  disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null,
};

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string; especialidad: string }> }): Promise<Metadata> {
  const { ciudad, especialidad } = await params;
  const nombreCiudad = ciudadDesdeParam(ciudad);
  if (!esEspecialidadValida(especialidad)) return { title: 'Instructoras de Pilates y Yoga | Tentare Network' };
  const nombreEspecialidad = ESPECIALIDAD_LABEL[especialidad];
  const disciplina = DISCIPLINA_DE_ESPECIALIDAD[especialidad];
  const nombreDisciplina = disciplina ? DISCIPLINA_LABEL[disciplina] : 'Pilates y Yoga';
  return {
    title: `Instructoras de ${nombreDisciplina} de ${nombreEspecialidad} en ${nombreCiudad} | Tentare Network`,
    description: `Instructoras de ${nombreDisciplina} especializadas en ${nombreEspecialidad} en ${nombreCiudad}, verificadas y disponibles.`,
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
  const nombreEspecialidad = ESPECIALIDAD_LABEL[especialidad];
  return (
    <MarketplaceLayout
      filtro={{ ...FILTRO_BASE, ciudad: nombreCiudad, especialidades: [especialidad] }}
      tituloCiudad={nombreCiudad}
      disciplinaFija={DISCIPLINA_DE_ESPECIALIDAD[especialidad]}
      migasPan={[
        { name: 'Instructoras', item: `${LEGAL.url}/network/instructoras` },
        { name: nombreCiudad, item: `${LEGAL.url}/network/instructoras/ciudad/${ciudad}` },
        { name: nombreEspecialidad, item: `${LEGAL.url}/network/instructoras/ciudad/${ciudad}/${especialidad}` },
      ]}
    />
  );
}
