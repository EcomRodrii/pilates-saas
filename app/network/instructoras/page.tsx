import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico, filtroDesdeSearchParams } from '@/lib/network/publico';
import { FiltrosMarketplace } from '@/components/network-publico/filtros-marketplace';
import { ResultadosMarketplace } from '@/components/network-publico/resultados-marketplace';

// Marketplace público de Tentare Network — Server Component a propósito
// (docs/NETWORK-AUDIT-2.md §11): sin esto, Google vería un div vacío que se
// rellena con JS y nunca indexaría "instructoras de pilates en Barcelona".
// Sin sesión: buscarPerfilesPublico() ya filtra a estado='published' y solo
// columnas públicas, así que no hace falta ningún guard aquí.
export const metadata: Metadata = {
  title: 'Instructoras de Pilates | Tentare Network',
  description: 'Encuentra instructoras de Pilates disponibles cerca de ti. Filtra por especialidad, ubicación y disponibilidad.',
};

export default async function MarketplaceInstructorasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const urlSearchParams = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]])),
  );
  const filtro = filtroDesdeSearchParams(urlSearchParams);

  const admin = getSupabaseAdmin();
  const resultado = admin ? await buscarPerfilesPublico(admin, filtro) : null;
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];

  const hayFiltrosActivos = Boolean(
    filtro.ciudad || filtro.especialidades.length || filtro.disponibilidad.length
    || filtro.horarios.length || filtro.tipoTrabajo.length || filtro.experienciaMinima != null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-[#1A1A1A]">Encuentra tu instructora de Pilates</h1>
        <p className="text-[13.5px] text-[#8E8E86] mt-1">
          {perfiles.length > 0
            ? `${perfiles.length} instructora${perfiles.length === 1 ? '' : 's'} en Tentare Network`
            : 'Instructoras verificadas de Pilates, listas para tu estudio.'}
        </p>
      </div>

      <FiltrosMarketplace />

      <ResultadosMarketplace perfiles={perfiles} hayFiltrosActivos={hayFiltrosActivos} />
    </div>
  );
}
