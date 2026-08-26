import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, Globe, CalendarCheck } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerEstudioPublicoPorSlug } from '@/lib/network/publico-estudios';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { BotonFavoritoAlumna } from '@/components/network/boton-favorito-alumna';
import { FormularioResenaAlumna } from '@/components/network/formulario-resena-alumna';
import { LEGAL } from '@/lib/legal-info';
import { hrefCanal } from '@/lib/canales-estudio';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_PRODUCTO } from '@/components/network-v2/tokens';

// Ficha pública de ESTUDIO (quinta pieza de F3) — hermana de
// app/network/instructoras/[slug]/page.tsx, mismo patrón de estructura
// (NavPublico/PieNetwork, generateMetadata + cache(), JSON-LD). A
// diferencia de esa ficha, esta es puro descubrimiento: sin email/teléfono
// del estudio (decisión ya confirmada con el fundador — ver
// lib/network/publico-estudios.ts) y sin reconstruir el motor de reservas
// aquí.
//
// Decisión revisada 2026-08-25: en vez de contacto directo, el CTA
// deep-linkea a /reservar/[slug] — MISMA columna `studios.slug` que usa
// fetchPublicStudioData (lib/db/supabase-data-admin.ts:339), verificado
// antes de enlazar. Da la sensación de camino corto sin duplicar el stack
// real de reserva (bono/salud/pago/cancelación) dentro de Network.
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
              {/* `hrefCanal` y no el valor crudo: `studios.sitio_web` lo teclea
                  el estudio y aquí se pinta como href. Los otros dos
                  consumidores de este mismo dato ya pasaban por el helper —
                  este se quedó fuera. Devuelve null (y no se pinta el enlace)
                  para todo lo que no sea http/https. */}
              {hrefCanal('web', estudio.sitioWeb) && (
                <a
                  href={hrefCanal('web', estudio.sitioWeb)!}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1 font-semibold hover:opacity-70"
                  style={{ color: NW_TINTA }}
                >
                  <Globe size={14} /> Sitio web
                </a>
              )}
              {estudio.lat != null && estudio.lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${estudio.lat}&mlon=${estudio.lng}#map=15/${estudio.lat}/${estudio.lng}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1 font-semibold hover:opacity-70"
                  style={{ color: NW_TINTA }}
                >
                  <MapPin size={14} /> Ver ubicación
                </a>
              )}
            </div>

            <p className="mt-6 text-[15px] leading-[1.7] max-w-[640px]" style={{ color: '#4A5347' }}>
              {estudio.descripcion ?? `${estudio.nombre} todavía no ha añadido una descripción de su estudio en Tentare Network.`}
            </p>

            <Link
              href={`/reservar/${estudio.slug}`}
              className="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-full text-[14px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: NW_PRODUCTO }}
            >
              <CalendarCheck size={16} /> Reservar en {estudio.nombre}
            </Link>
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

        {/* Solo se pinta si el servidor confirma elegibilidad — ver
            components/network/formulario-resena-alumna.tsx. Hoy nunca se
            muestra aquí (red_resenas.perfil_id sigue NOT NULL, sin perfil
            natural para "el estudio en sí"), documentado en ese componente
            y en app/api/network/alumna/resenas/route.ts. */}
        <FormularioResenaAlumna tipo="estudio" id={estudio.id} nombre={estudio.nombre} />
      </div>

      <PieNetwork />
    </div>
  );
}
