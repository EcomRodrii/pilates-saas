import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Star, MapPin, GraduationCap } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerPerfilPublicoPorSlug } from '@/lib/network/publico';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { BotonContactar, BotonReportar } from '@/components/network-publico/boton-contactar';
import { rangoAnios } from '@/lib/network/formato';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
  tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_SAGE, NW_SAND, NW_BORDE, NW_PRODUCTO, NW_ESTRELLA } from '@/components/network-v2/tokens';

// Perfil público indexable (1c del rediseño) — Server Component puro, sin
// 'use client': generateMetadata solo funciona así. Misma capa de datos que
// antes (obtenerPerfilPublicoPorSlug, sin tocar); esto es un rediseño
// visual: foto grande + cabecera + fila de stats, cuerpo en dos columnas
// con aside de contacto sticky, en vez de la lista de tarjetas apiladas
// anterior.
//
// "Formación": certificaciones con estado 'verificado' únicamente — una
// certificación no se enseña como logro solo por haberla subido (mismo
// criterio que "Perfil verificado" arriba). lib/network/publico.ts ya
// filtra por estado y nunca expone documentoPath aquí.
//
// La tabla semanal día-a-día sigue sin pintarse: el dato real de hoy son
// franjas agregadas (mañanas/tardes/noches/fines de semana), no un
// calendario por día — fabricar esa vista sería inventar un dato que no
// existe.

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
  const profesion = tituloProfesionalDe(perfil.especialidades);
  const title = `${perfil.nombre} — ${profesion}${ciudad} | Tentare Network`;
  const description = perfil.descripcion?.slice(0, 155)
    ?? `${profesion}${ciudad}. ${perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(', ')}.`;
  const url = `${LEGAL.url}/network/instructoras/${slug}`;

  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: perfil.fotoUrl ? [perfil.fotoUrl] : undefined },
    twitter: { card: 'summary', title, description, images: perfil.fotoUrl ? [perfil.fotoUrl] : undefined },
  };
}

function FilaStat({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div>
      <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>{valor}</p>
      <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>{etiqueta}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function PerfilInstructoraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) notFound();

  const { perfil, experiencias, certificaciones, badges, resenas } = detalle;

  const url = `${LEGAL.url}/network/instructoras/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: perfil.nombre,
    jobTitle: tituloProfesionalDe(perfil.especialidades),
    ...(perfil.ciudad ? { address: { '@type': 'PostalAddress', addressLocality: perfil.ciudad } } : {}),
    ...(perfil.fotoUrl ? { image: perfil.fotoUrl } : {}),
    ...(perfil.descripcion ? { description: perfil.descripcion } : {}),
    url,
    isPartOf: { '@type': 'WebSite', name: LEGAL.marca, url: LEGAL.url },
    ...(perfil.resumenResenas.total > 0 ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: perfil.resumenResenas.promedio, reviewCount: perfil.resumenResenas.total },
    } : {}),
  };

  // Mismo patrón de 3 niveles que FeatureStructuredData.tsx.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Instructoras', item: `${LEGAL.url}/network/instructoras` },
      { '@type': 'ListItem', position: 3, name: perfil.nombre, item: url },
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
            <FotoInstructora fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} aspectRatio="4 / 4.8" radius={26} />
          </div>

          <div>
            {badges.experienciaVerificada && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold mb-3" style={{ background: '#EAF0E7', color: '#2E5A3A' }}>
                <BadgeCheck size={13} /> Perfil verificado
              </span>
            )}
            <h1 className="text-[44px] sm:text-[56px] font-extrabold leading-[0.98] tracking-tight">{perfil.nombre}</h1>
            <p className="mt-2 text-[16px] font-bold" style={{ color: NW_PRODUCTO }}>
              {tituloProfesionalDe(perfil.especialidades)}
              {perfil.especialidades.length > 0 ? ` · ${perfil.especialidades.slice(0, 2).map(e => ESPECIALIDAD_LABEL[e]).join(' & ')}` : ''}
            </p>
            <div className="mt-3 flex items-center gap-4 flex-wrap text-[13.5px]" style={{ color: NW_MUTED }}>
              {perfil.resumenResenas.total > 0 && (
                <span className="flex items-center gap-1 font-semibold" style={{ color: NW_TINTA }}>
                  <Star size={14} style={{ color: NW_ESTRELLA }} fill="currentColor" />
                  {perfil.resumenResenas.promedio} ({perfil.resumenResenas.total})
                </span>
              )}
              {perfil.ciudad && (
                <span className="flex items-center gap-1"><MapPin size={13} />{perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}</span>
              )}
            </div>

            <div className="mt-6 pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
              {perfil.aniosExperiencia != null && <FilaStat valor={`${perfil.aniosExperiencia}`} etiqueta="años de experiencia" />}
              {experiencias.length > 0 && (
                <FilaStat
                  valor={`${new Set(experiencias.map(e => e.studioId ?? e.nombreEstudio)).size}`}
                  etiqueta="estudios"
                />
              )}
              <FilaStat valor={perfil.tipoTrabajo.length > 0 ? perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).slice(0, 2).join(' · ') : '—'} etiqueta="disponible para" />
              <FilaStat valor={perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'} etiqueta="tarifa orientativa" />
              <FilaStat valor={DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]} etiqueta="estado" />
            </div>
          </div>
        </div>

        <div className="mt-14 grid lg:grid-cols-[1fr_340px] gap-14">
          <div className="space-y-10">
            {perfil.descripcion && (
              <Seccion titulo="Sobre mí">
                <p className="text-[15px] leading-[1.7] max-w-[640px]" style={{ color: '#4A5347' }}>{perfil.descripcion}</p>
              </Seccion>
            )}

            {perfil.especialidades.length > 0 && (
              <Seccion titulo="Especialidades">
                <div className="flex flex-wrap gap-2">
                  {perfil.especialidades.map(e => (
                    <span key={e} className="px-[18px] py-[9px] rounded-full text-[13.5px] font-bold" style={{ background: NW_SAGE, color: NW_TINTA }}>
                      {ESPECIALIDAD_LABEL[e]}
                    </span>
                  ))}
                </div>
              </Seccion>
            )}

            {experiencias.length > 0 && (
              <Seccion titulo="Experiencia">
                <div>
                  {experiencias.map((exp, i) => (
                    <div key={exp.id} className="flex gap-3.5 py-4" style={{ borderTop: i > 0 ? `1px solid ${NW_BORDE}` : undefined }}>
                      <div
                        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-extrabold"
                        style={{ background: NW_SAND, color: NW_TINTA }}
                      >
                        {exp.nombreEstudio.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[15px] font-bold" style={{ color: NW_TINTA }}>{exp.nombreEstudio}</p>
                          {exp.estadoVerificacion === 'confirmada' && <BadgeCheck size={13} color={NW_PRODUCTO} />}
                        </div>
                        <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                        {exp.descripcion && <p className="text-[13.5px] mt-1" style={{ color: NW_MUTED }}>{exp.descripcion}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {certificaciones.length > 0 && (
              <Seccion titulo="Formación">
                <div className="space-y-3">
                  {certificaciones.map((c, i) => (
                    <div key={`${c.nombre}-${i}`} className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5" style={{ color: NW_PRODUCTO }}><GraduationCap size={16} /></div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{c.nombre}</p>
                        <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{c.institucion}{c.anio ? ` · ${c.anio}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {(perfil.disponibilidadHorarios.length > 0 || perfil.tipoTrabajo.length > 0) && (
              <Seccion titulo="Disponibilidad">
                <p className="text-[14px] font-semibold" style={{ color: NW_TINTA }}>{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</p>
                {perfil.disponibilidadHorarios.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {perfil.disponibilidadHorarios.map(h => (
                      <span key={h} className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}>
                        {HORARIO_LABEL[h]}
                      </span>
                    ))}
                  </div>
                )}
              </Seccion>
            )}

            {resenas.length > 0 && (
              <Seccion titulo={`Opiniones · ${perfil.resumenResenas.promedio ?? '—'} de ${resenas.length}`}>
                <div className="space-y-4">
                  {resenas.map((r, i) => (
                    <div key={r.id} style={{ borderTop: i > 0 ? `1px solid ${NW_BORDE}` : undefined, paddingTop: i > 0 ? 16 : 0 }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }, (_, j) => (
                            <Star key={j} size={13} style={{ color: j < r.puntuacion ? NW_ESTRELLA : NW_BORDE }} fill="currentColor" />
                          ))}
                        </div>
                        <span className="text-[12px]" style={{ color: NW_MUTED_2 }}>{r.estudioNombre}</span>
                      </div>
                      {r.comentario && <p className="text-[14px] leading-[1.65] mt-2" style={{ color: '#4A5347' }}>{r.comentario}</p>}
                    </div>
                  ))}
                </div>
              </Seccion>
            )}
          </div>

          {/* Aside sticky — oculto en móvil, sustituido por la barra fija de abajo. */}
          <aside className="hidden lg:block self-start sticky top-24">
            <div className="bg-white rounded-[22px] p-6" style={{ border: `1px solid ${NW_BORDE}` }}>
              <p className="text-[17px] font-extrabold">
                ¿Quieres contactar con {perfil.nombre.split(' ')[0]}?
              </p>
              <div className="mt-4">
                <BotonContactar perfilId={perfil.id} nombre={perfil.nombre} />
              </div>
              {/* Sin cifra de tiempo de respuesta: no se mide en ningún
                  sitio (mismo criterio que resumenResenas — nunca una señal
                  fabricada), así que aquí no va nada hasta que exista el
                  dato real. */}
              <div className="mt-5 pt-5 space-y-2 text-[13px]" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
                {perfil.ciudad && <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Zona</span><span className="font-semibold">{perfil.ciudad}</span></div>}
                <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Disponibilidad</span><span className="font-semibold">{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</span></div>
                <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Precio</span><span className="font-semibold">{perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'}</span></div>
              </div>
              <p className="mt-4 text-[11.5px] rounded-lg px-3 py-2.5" style={{ background: NW_SAND, color: NW_MUTED }}>
                Sin comisiones: contactas directamente con {perfil.nombre.split(' ')[0]}.
              </p>
              <div className="mt-3 text-center"><BotonReportar perfilId={perfil.id} /></div>
            </div>
          </aside>
        </div>
      </div>

      {/* CTA sticky inferior en móvil (1e frame 2). */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 p-4 pt-8"
        style={{ background: 'linear-gradient(to top, #FAF9F5 55%, transparent)' }}
      >
        <div className="bg-white rounded-2xl p-3 flex items-center justify-between gap-3" style={{ border: `1px solid ${NW_BORDE}`, boxShadow: '0 -8px 24px rgba(34,42,51,.1)' }}>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold truncate" style={{ color: NW_TINTA }}>Contactar con {perfil.nombre.split(' ')[0]}</p>
            <p className="text-[11px]" style={{ color: NW_MUTED_2 }}>
              {perfil.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[perfil.tarifaRango]}` : 'Tarifa a consultar'}
            </p>
          </div>
          <BotonContactar perfilId={perfil.id} nombre={perfil.nombre} />
        </div>
      </div>

      <PieNetwork />
    </div>
  );
}
