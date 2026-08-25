import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarEstudiosPublicos, filtroEstudiosDesdeSearchParams } from '@/lib/network/publico-estudios';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { TarjetaEstudio } from '@/components/network-v2/TarjetaEstudio';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAND_2, NW_PRODUCTO } from '@/components/network-v2/tokens';

// Listado público de ESTUDIOS (piezas 1a+1b de F3) — hermano deliberadamente
// más sencillo de MarketplaceLayout (instructoras): sin mapa/orden/
// comparación, una lista de tarjetas que enlaza a /network/estudios/[slug].
// Server Component, mismo motivo de SEO que el resto de /network (docs/
// NETWORK-AUDIT-2.md §11) — la consulta va directa a buscarEstudiosPublicos,
// no vía fetch al endpoint público (ese existe como primitiva aparte, ver
// app/api/public/network/estudios/buscar/route.ts).
//
// Auditoría UX 2026-08-25: la tarjeta pintaba solo foto+nombre+ciudad y
// tiraba `descripcion` (ya venía de la query) sin usarla, sin el
// tratamiento de hover/CTA que sí tiene TarjetaInstructora, y el estado
// vacío era un párrafo plano frente al estado rico de MarketplaceLayout.
// Cerrado con TarjetaEstudio.tsx (mismo lenguaje visual) y un estado vacío
// con el mismo patrón (título grande + dos CTAs) — sin reutilizar
// FormularioInteresEstudio aquí: su copy ("perfiles que puedan encajar")
// es específico de la demanda de instructoras, no encaja con un directorio
// de estudios vacío.
export const metadata: Metadata = {
  title: 'Estudios de Pilates y Yoga | Tentare Network',
  description: 'Descubre estudios de Pilates y Yoga en el directorio de Tentare Network.',
};

export default async function MarketplaceEstudiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const urlSearchParams = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]])),
  );
  const filtro = filtroEstudiosDesdeSearchParams(urlSearchParams);

  const admin = getSupabaseAdmin();
  const resultado = admin ? await buscarEstudiosPublicos(admin, filtro) : null;
  const estudios = resultado && 'estudios' in resultado ? resultado.estudios : [];

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Estudios', item: `${LEGAL.url}/network/estudios` },
    ],
  };

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA, minHeight: '100dvh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <NavPublico />

      <div className="max-w-[1240px] mx-auto px-6 pt-10 pb-24">
        <h1 className="text-[38px] font-extrabold tracking-tight">
          Estudios de Pilates y Yoga
          {filtro.ciudad ? (
            <> en <span style={{ color: 'var(--brand)' }}>{filtro.ciudad}</span></>
          ) : null}
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: NW_MUTED }}>
          {estudios.length > 0
            ? `${estudios.length} estudio${estudios.length === 1 ? '' : 's'} en el directorio.`
            : 'Todavía no hay estudios publicados en el directorio.'}
        </p>

        {estudios.length > 0 && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {estudios.map(e => <TarjetaEstudio key={e.id} estudio={e} />)}
          </div>
        )}

        {estudios.length === 0 && (
          <div className="mt-8 rounded-[22px] p-10 text-center" style={{ background: NW_SAND_2 }}>
            <p className="text-[22px] font-extrabold">
              Todavía no hay estudios publicados aquí.
            </p>
            <p className="mt-2 text-[14px]" style={{ color: NW_MUTED }}>
              Estamos empezando por Barcelona y Madrid — mientras tanto, explora las instructoras ya disponibles.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/network/instructoras" className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white" style={{ background: NW_PRODUCTO }}>
                Explorar instructoras
              </Link>
              <Link href="/network/acceso" className="px-5 py-2.5 rounded-full text-[13.5px] font-bold" style={{ border: `1px solid ${NW_TINTA}`, color: NW_TINTA }}>
                Soy un estudio
              </Link>
            </div>
          </div>
        )}
      </div>

      <PieNetwork />
    </div>
  );
}
