import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico, ciudadesConPerfilesPublicados, slugCiudadUrl } from '@/lib/network/publico';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
import { LEGAL } from '@/lib/legal-info';
import { NavPublico } from './NavPublico';
import { PieNetwork } from './PieNetwork';
import { FiltrosSidebar, ChipsActivos } from './FiltrosSidebar';
import { HojaFiltrosMovil } from './HojaFiltrosMovil';
import { ResultadosInstructoras } from './ResultadosInstructoras';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAND_2, NW_PRODUCTO } from './tokens';

// Layout compartido del marketplace (1b) — usado por /network/instructoras
// Y por las variantes SEO /network/instructoras/[ciudad] y
// [ciudad]/[especialidad] (README: "MISMO layout, título dinámico"). El
// dato sigue viniendo de lib/network/publico.ts sin cambios; esto es
// puramente la vista.
export async function MarketplaceLayout({
  filtro, tituloCiudad, migasPan,
}: {
  filtro: FiltroBusquedaNetwork;
  /** Ciudad a nombrar en el H1 ("Instructoras de Pilates en {X}"), o null para el genérico. */
  tituloCiudad: string | null;
  /** Niveles tras "Inicio" (mismo patrón que FeatureStructuredData.tsx) — el propio llamador conoce su profundidad real. */
  migasPan: { name: string; item: string }[];
}) {
  const admin = getSupabaseAdmin();
  const [resultado, ciudades] = await Promise.all([
    admin ? buscarPerfilesPublico(admin, filtro) : Promise.resolve(null),
    admin ? ciudadesConPerfilesPublicados(admin) : Promise.resolve([]),
  ]);
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];
  // Otras ciudades reales (con perfiles) — enlazado interno hacia las
  // páginas SEO /ciudad/[ciudad], que hasta ahora no las enlazaba nadie.
  const otrasCiudades = ciudades.filter(c => c !== tituloCiudad);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      ...migasPan.map((m, i) => ({ '@type': 'ListItem', position: i + 2, name: m.name, item: m.item })),
    ],
  };

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA, minHeight: '100dvh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <NavPublico />

      <div className="max-w-[1240px] mx-auto px-6 pt-10 pb-4">
        <h1 className="text-[38px] font-extrabold tracking-tight">
          Instructoras de Pilates{tituloCiudad ? (
            <> en <span style={{ color: NW_PRODUCTO }}>{tituloCiudad}</span></>
          ) : null}
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: NW_MUTED }}>
          {perfiles.length > 0
            ? `${perfiles.length} instructora${perfiles.length === 1 ? '' : 's'}${tituloCiudad ? ` en ${tituloCiudad}` : ''}`
            : 'Perfiles verificados de Pilates, listos para tu estudio.'}
        </p>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 pb-20 grid lg:grid-cols-[264px_1fr] gap-9">
        <aside className="hidden lg:block self-start sticky top-6">
          <FiltrosSidebar />
        </aside>

        <div>
          <HojaFiltrosMovil />
          <ChipsActivos />
          {perfiles.length === 0 ? (
            <div className="rounded-[22px] p-10 text-center" style={{ background: NW_SAND_2 }}>
              <p className="text-[22px] font-extrabold">
                ¿Buscas en otra zona? Todavía estamos construyendo la network allí.
              </p>
              <p className="mt-2 text-[14px]" style={{ color: NW_MUTED }}>
                Prueba con otra ciudad o especialidad, o sé de las primeras en publicar tu perfil.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                <Link href="/network/instructoras" className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white" style={{ background: NW_PRODUCTO }}>
                  Amplía tu búsqueda
                </Link>
                <Link href="/network/crear-perfil" className="px-5 py-2.5 rounded-full text-[13.5px] font-bold" style={{ border: `1px solid ${NW_TINTA}`, color: NW_TINTA }}>
                  Crear perfil de instructora
                </Link>
              </div>
            </div>
          ) : (
            <ResultadosInstructoras perfiles={perfiles} />
          )}
        </div>
      </div>

      {otrasCiudades.length > 0 && (
        <div className="max-w-[1240px] mx-auto px-6 pb-14">
          <p className="text-[12.5px] font-semibold mb-2.5" style={{ color: NW_MUTED }}>Otras ciudades</p>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {otrasCiudades.map(ciudad => (
              <Link
                key={ciudad}
                href={`/network/instructoras/ciudad/${slugCiudadUrl(ciudad)}`}
                className="text-[13px] font-medium hover:underline"
                style={{ color: NW_MUTED }}
              >
                {ciudad}
              </Link>
            ))}
          </div>
        </div>
      )}

      <PieNetwork />
    </div>
  );
}
