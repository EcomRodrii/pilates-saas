import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, BadgeCheck, Star } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerPerfilPublicoPorSlug } from '@/lib/network/publico';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { BotonContactar, BotonReportar } from '@/components/network-publico/boton-contactar';
import { rangoAnios } from '@/lib/network/formato';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import { LEGAL } from '@/lib/legal-info';

// Perfil público indexable — docs/NETWORK-AUDIT-2.md, brief §11/§12/§37.
// Server Component puro (sin 'use client'): generateMetadata solo funciona
// así, y es lo que hace que Google vea title/description/OG reales por
// instructora en vez de una sola metadata genérica para todo /network.

async function cargar(slug: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const detalle = await obtenerPerfilPublicoPorSlug(admin, slug);
  if (!detalle || 'error' in detalle) return null;
  return detalle;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) return { title: 'Perfil no encontrado | Tentare Network' };

  const { perfil } = detalle;
  const ciudad = perfil.ciudad ? ` en ${perfil.ciudad}` : '';
  const title = `${perfil.nombre} — Instructora de Pilates${ciudad} | Tentare Network`;
  const description = perfil.descripcion?.slice(0, 155)
    ?? `Instructora de Pilates${ciudad}. ${perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(', ')}.`;
  const url = `${LEGAL.url}/network/instructoras/${slug}`;

  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: perfil.fotoUrl ? [perfil.fotoUrl] : undefined },
    twitter: { card: 'summary', title, description, images: perfil.fotoUrl ? [perfil.fotoUrl] : undefined },
  };
}

export default async function PerfilInstructoraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) notFound();

  const { perfil, experiencias, badges, resenas } = detalle;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: perfil.nombre,
    jobTitle: 'Instructora de Pilates',
    ...(perfil.ciudad ? { address: { '@type': 'PostalAddress', addressLocality: perfil.ciudad } } : {}),
    ...(perfil.fotoUrl ? { image: perfil.fotoUrl } : {}),
    ...(perfil.descripcion ? { description: perfil.descripcion } : {}),
    url: `${LEGAL.url}/network/instructoras/${slug}`,
    ...(perfil.resumenResenas.total > 0 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: perfil.resumenResenas.promedio,
        reviewCount: perfil.resumenResenas.total,
      },
    } : {}),
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="flex flex-col items-center text-center gap-3">
        <ProfileAvatar fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} size="xl" />
        <div>
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">{perfil.nombre}</h1>
            {badges.experienciaVerificada && <BadgeCheck size={18} className="text-brand" />}
          </div>
          <p className="text-[13.5px] text-[#8E8E86]">Instructora de Pilates</p>
          {perfil.resumenResenas.total > 0 && (
            <p className="text-[13px] font-medium text-[#1A1A1A] flex items-center justify-center gap-1 mt-0.5">
              <Star size={13} className="text-amber-500" fill="currentColor" />
              {perfil.resumenResenas.promedio}
              <span className="text-[#8E8E86] font-normal">
                ({perfil.resumenResenas.total} {perfil.resumenResenas.total === 1 ? 'reseña' : 'reseñas'})
              </span>
            </p>
          )}
          {perfil.ciudad && (
            <p className="text-[13px] text-[#8E8E86] flex items-center justify-center gap-1 mt-0.5">
              <MapPin size={12} />{perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
            </p>
          )}
        </div>
        <BotonContactar perfilId={perfil.id} nombre={perfil.nombre} />
      </div>

      {(badges.emailVerificado || badges.experienciaVerificada || badges.referenciaProfesional || badges.identidadVerificada || badges.activaRecientemente) && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <ListaBadgesNetwork badges={badges} />
        </div>
      )}

      {perfil.descripcion && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A] mb-2">Sobre mí</h2>
          <p className="text-[13.5px] text-[#3A3A34] whitespace-pre-line">{perfil.descripcion}</p>
        </div>
      )}

      {perfil.especialidades.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A] mb-2">Especialidades</h2>
          <div className="flex flex-wrap gap-1.5">
            {perfil.especialidades.map(e => (
              <span key={e} className="px-3 py-1 rounded-full bg-[#F1F2EA] text-[12.5px] text-[#3A3A34]">{ESPECIALIDAD_LABEL[e]}</span>
            ))}
          </div>
        </div>
      )}

      {experiencias.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A] mb-3">Experiencia</h2>
          <div className="space-y-3">
            {experiencias.map(exp => (
              <div key={exp.id}>
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{exp.nombreEstudio}</p>
                  {exp.estadoVerificacion === 'confirmada' && <BadgeCheck size={13} className="text-brand" />}
                </div>
                <p className="text-[12px] text-[#8E8E86]">{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                {exp.descripcion && <p className="text-[12.5px] text-[#3A3A34] mt-1">{exp.descripcion}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(perfil.tipoTrabajo.length > 0 || perfil.disponibilidadHorarios.length > 0) && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A] mb-2">Disponibilidad</h2>
          <p className="text-[13px] text-[#3A3A34]">{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</p>
          {perfil.disponibilidadHorarios.length > 0 && (
            <p className="text-[12.5px] text-[#8E8E86] mt-1">
              {perfil.disponibilidadHorarios.map(h => HORARIO_LABEL[h]).join(' · ')}
            </p>
          )}
          {perfil.tipoTrabajo.length > 0 && (
            <p className="text-[12.5px] text-[#8E8E86] mt-1">
              {perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).join(' · ')}
            </p>
          )}
        </div>
      )}

      {resenas.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5">
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A] mb-3">
            Reseñas de estudios ({resenas.length})
          </h2>
          <div className="space-y-3">
            {resenas.map(r => (
              <div key={r.id} className="border-t border-[#E7E7E0] first:border-t-0 first:pt-0 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i} size={12}
                        className={i < r.puntuacion ? 'text-amber-500' : 'text-[#E7E7E0]'}
                        fill="currentColor"
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-[#8E8E86]">{r.estudioNombre}</span>
                </div>
                {r.comentario && <p className="text-[12.5px] text-[#3A3A34] mt-1.5">{r.comentario}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E7E7E0] p-5 flex items-center justify-between">
        <div>
          <h2 className="text-[13.5px] font-semibold text-[#1A1A1A]">Tarifa</h2>
          <p className="text-[13px] text-[#3A3A34] mt-1">
            {perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'}
          </p>
        </div>
        <BotonReportar perfilId={perfil.id} />
      </div>
    </div>
  );
}
