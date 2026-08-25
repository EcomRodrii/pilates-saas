import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarEstudiosPublicos, filtroEstudiosDesdeSearchParams } from '@/lib/network/publico-estudios';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_BORDE, NW_RADIO } from '@/components/network-v2/tokens';

// Listado público de ESTUDIOS (piezas 1a+1b de F3) — hermano deliberadamente
// más sencillo de MarketplaceLayout (instructoras): sin mapa/orden/
// comparación, una lista de tarjetas nombre/ciudad/foto que enlaza a
// /network/estudios/[slug] (ya construida en el commit anterior). Server
// Component, mismo motivo de SEO que el resto de /network (docs/NETWORK-
// AUDIT-2.md §11) — la consulta va directa a buscarEstudiosPublicos, no vía
// fetch al endpoint público (ese existe como primitiva aparte, ver
// app/api/public/network/estudios/buscar/route.ts).
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
            {estudios.map(e => (
              <Link key={e.id} href={`/network/estudios/${e.slug}`} className="block group">
                <FotoInstructora fotoUrl={e.fotoUrl ?? e.logoUrl} nombre={e.nombre} aspectRatio="1 / 1.1" radius={18} />
                <p className="mt-2.5 text-[14.5px] font-bold truncate" style={{ color: NW_TINTA }}>{e.nombre}</p>
                {e.ciudad && (
                  <p className="mt-0.5 flex items-center gap-1 text-[12.5px]" style={{ color: NW_MUTED }}>
                    <MapPin size={12} />{e.ciudad}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

        {estudios.length === 0 && (
          <div className="mt-8 p-8 text-center" style={{ borderRadius: NW_RADIO.tarjeta, border: `1px solid ${NW_BORDE}` }}>
            <p className="text-[13.5px]" style={{ color: NW_MUTED }}>
              Vuelve pronto — el directorio de estudios se está construyendo.
            </p>
          </div>
        )}
      </div>

      <PieNetwork />
    </div>
  );
}
