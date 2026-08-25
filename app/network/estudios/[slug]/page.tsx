import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Globe } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerEstudioPublicoPorSlug } from '@/lib/network/publico-estudios';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { BotonFavoritoAlumna } from '@/components/network/boton-favorito-alumna';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_SAND, NW_BORDE } from '@/components/network-v2/tokens';

// Ficha pública de ESTUDIO (quinta pieza de F3) — hermana de
// app/network/instructoras/[slug]/page.tsx, mismo patrón de estructura
// (NavPublico/PieNetwork, generateMetadata + cache(), JSON-LD). A
// diferencia de esa ficha, esta es puro descubrimiento: sin email/teléfono
// del estudio (decisión ya confirmada con el fundador — ver
// lib/network/publico-estudios.ts) y sin ningún CTA de "reservar" — el
// único enlace de acción posible es hacia /reservar/[slug], que esta
// pantalla no reconstruye.
const cargar = cache(async (slug: string) => {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  return obtenerEstudioPublicoPorSlug(admin, slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) return { title: 'Estudio no encontrado | Tentare Network' };

  const { estudio } = detalle;
  const ciudad = estudio.ciudad ? ` en ${estudio.ciudad}` : '';
  const title = `${estudio.nombre}${ciudad} | Tentare Network`;
  const description = estudio.descripcion?.slice(0, 155)
    ?? `${estudio.nombre}, un estudio${ciudad} en el directorio de Tentare Network.`;
  const url = `${LEGAL.url}/network/estudios/${slug}`;
  const imagen = estudio.fotoUrl ?? estudio.logoUrl ?? undefined;

  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: imagen ? [imagen] : undefined },
    twitter: { card: 'summary', title, description, images: imagen ? [imagen] : undefined },
  };
}

export default async function FichaEstudioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) notFound();

  const { estudio, instructorasDestacadas } = detalle;

  const url = `${LEGAL.url}/network/estudios/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: estudio.nombre,
    ...(estudio.ciudad ? { address: { '@type': 'PostalAddress', addressLocality: estudio.ciudad } } : {}),
    ...(estudio.lat != null && estudio.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: estudio.lat, longitude: estudio.lng } }
      : {}),
    ...(estudio.fotoUrl ? { image: estudio.fotoUrl } : {}),
    ...(estudio.descripcion ? { description: estudio.descripcion } : {}),
    url,
    isPartOf: { '@type': 'WebSite', name: LEGAL.marca, url: LEGAL.url },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Instructoras', item: `${LEGAL.url}/network/instructoras` },
      { '@type': 'ListItem', position: 3, name: estudio.nombre, item: url },
    ],
  };

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <NavPublico />

      <div className="max-w-[1240px] mx-auto px-6 pt-8 pb-24">
        <Link href="/network/instructoras" className="inline-flex items-center gap-1.5 text-[13px] font-semibold mb-6" style={{ color: NW_MUTED }}>
          <ArrowLeft size={14} /> Volver a instructoras
        </Link>

        <div className="grid lg:grid-cols-[420px_1fr] gap-10">
          <div>
            <FotoInstructora fotoUrl={estudio.fotoUrl ?? estudio.logoUrl} nombre={estudio.nombre} aspectRatio="4 / 4.8" radius={26} eager />
          </div>

          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[44px] sm:text-[56px] font-extrabold leading-[0.98] tracking-tight">{estudio.nombre}</h1>
              <div className="shrink-0 mt-2">
                <BotonFavoritoAlumna tipo="estudio" id={estudio.id} compacto />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 flex-wrap text-[13.5px]" style={{ color: NW_MUTED }}>
              {estudio.ciudad && (
                <span className="flex items-center gap-1"><MapPin size={14} />{estudio.ciudad}</span>
              )}
              {estudio.sitioWeb && (
                <a
                  href={estudio.sitioWeb}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1 font-semibold hover:opacity-70"
                  style={{ color: NW_TINTA }}
                >
                  <Globe size={14} /> Sitio web
                </a>
              )}
            </div>

            {estudio.descripcion && (
              <p className="mt-6 text-[15px] leading-[1.7] max-w-[640px]" style={{ color: '#4A5347' }}>{estudio.descripcion}</p>
            )}
          </div>
        </div>

        {instructorasDestacadas.length > 0 && (
          <div className="mt-14">
            <h2 className="text-[22px] font-extrabold">Instructoras destacadas</h2>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {instructorasDestacadas.map((i, idx) => {
                const contenido = (
                  <>
                    <FotoInstructora fotoUrl={i.fotoUrl} nombre={i.nombre} aspectRatio="1 / 1" radius={16} />
                    <p className="mt-2 text-[14px] font-bold truncate" style={{ color: NW_TINTA }}>{i.nombre}</p>
                  </>
                );
                return i.slug ? (
                  <Link key={`${i.slug}-${idx}`} href={`/network/instructoras/${i.slug}`} className="block group">
                    {contenido}
                  </Link>
                ) : (
                  <div key={`${i.nombre}-${idx}`}>{contenido}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sin ficha de contacto directo (email/teléfono) por diseño — ver
            lib/network/publico-estudios.ts. Este bloque solo señala que el
            estudio existe en el directorio, sin ningún CTA de reserva. */}
        <div className="mt-14 rounded-[22px] p-6" style={{ background: NW_SAND, border: `1px solid ${NW_BORDE}` }}>
          <p className="text-[13.5px]" style={{ color: NW_MUTED_2 }}>
            Ficha de descubrimiento de {estudio.nombre} en el directorio de Tentare Network.
          </p>
        </div>
      </div>

      <PieNetwork />
    </div>
  );
}
