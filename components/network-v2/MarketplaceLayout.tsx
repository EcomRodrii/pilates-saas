import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
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
  filtro, tituloCiudad,
}: {
  filtro: FiltroBusquedaNetwork;
  /** Ciudad a nombrar en el H1 ("Instructoras de Pilates en {X}"), o null para el genérico. */
  tituloCiudad: string | null;
}) {
  const admin = getSupabaseAdmin();
  const resultado = admin ? await buscarPerfilesPublico(admin, filtro) : null;
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA, minHeight: '100dvh' }}>
      <NavPublico />

      <div className="max-w-[1240px] mx-auto px-6 pt-10 pb-4">
        <h1 className="text-[38px] font-extrabold tracking-tight">
          Instructoras de Pilates{tituloCiudad ? (
            <> en <em className="font-normal not-italic" style={{ fontFamily: 'var(--font-display)', color: NW_PRODUCTO }}>{tituloCiudad}</em></>
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
              <p className="text-[25px]" style={{ fontFamily: 'var(--font-display)' }}>
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

      <PieNetwork />
    </div>
  );
}
