import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketplaceLayout } from '@/components/network-v2/MarketplaceLayout';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import { esEspecialidadValida, ESPECIALIDAD_LABEL, DISCIPLINA_DE_ESPECIALIDAD, DISCIPLINA_LABEL, type EspecialidadNetwork } from '@/lib/network/catalogo';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
import { ciudadDesdeParam } from '@/lib/network/ciudad-param';
import { LEGAL } from '@/lib/legal-info';

// `ciudadDesdeParam` compartido con la variante solo-ciudad (antes duplicado
// literal en los dos ficheros, y sin validar en ninguno de los dos).

const FILTRO_BASE: Omit<FiltroBusquedaNetwork, 'ciudad' | 'especialidades'> = {
  disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null,
};

// Guardia de indexación (P1 de la auditoría 2026-08-25) — mismo criterio que
// la variante solo-ciudad: sin esto, cualquier combinación ciudad×
// especialidad de la URL genera una página 200 indexable, tenga o no
// contenido real detrás.
async function hayResultadosReales(nombreCiudad: string, especialidad: EspecialidadNetwork): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const resultado = await buscarPerfilesPublico(admin, { ...FILTRO_BASE, ciudad: nombreCiudad, especialidades: [especialidad] });
  return 'perfiles' in resultado && resultado.perfiles.length > 0;
}

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string; especialidad: string }> }): Promise<Metadata> {
  const { ciudad, especialidad } = await params;
  const nombreCiudad = ciudadDesdeParam(ciudad);
  if (!nombreCiudad || !esEspecialidadValida(especialidad)) return { title: 'Instructoras de Pilates y Yoga', robots: { index: false, follow: false } };
  const nombreEspecialidad = ESPECIALIDAD_LABEL[especialidad];
  const disciplina = DISCIPLINA_DE_ESPECIALIDAD[especialidad];
  const nombreDisciplina = disciplina ? DISCIPLINA_LABEL[disciplina] : 'Pilates y Yoga';
  const indexable = await hayResultadosReales(nombreCiudad, especialidad);
  return {
    title: `Instructoras de ${nombreDisciplina} de ${nombreEspecialidad} en ${nombreCiudad}`,
    description: `Instructoras de ${nombreDisciplina} especializadas en ${nombreEspecialidad} en ${nombreCiudad}, verificadas y disponibles.`,
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
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
  if (!nombreCiudad) notFound();
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
