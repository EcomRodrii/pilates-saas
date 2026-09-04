import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, BadgeCheck, Star, MapPin, GraduationCap, Building2, Briefcase, Images,
  ShieldCheck, AtSign, Globe, CircleDot, Navigation,
} from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerPerfilPublicoPorSlug } from '@/lib/network/publico';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { BotonContactar, BotonReportar } from '@/components/network-publico/boton-contactar';
import { BotonCompartirPerfil } from '@/components/network-publico/boton-compartir';
import { BioExpandible } from '@/components/network-publico/bio-expandible';
import { BotonFavoritoAlumna } from '@/components/network/boton-favorito-alumna';
import { FormularioResenaAlumna } from '@/components/network/formulario-resena-alumna';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { FilaStat } from '@/components/network/ficha-layout';
import { rangoAnios, hrefDeRedSocial, hrefDeWeb } from '@/lib/network/formato';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
  tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { LEGAL } from '@/lib/legal-info';
import {
  NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_SAGE, NW_SAND, NW_BORDE, NW_PRODUCTO,
  NW_ESTRELLA, NW_ESTADO,
} from '@/components/network-v2/tokens';

// Rediseño 2026-08-31 — pedido explícito: la ficha anterior (foto+cabecera+
// fila de stats+lista de secciones apiladas) ya tenía casi todas las
// secciones que pedía el brief, pero cada una desaparecía en silencio en
// cuanto faltaba un dato — con un perfil poco relleno (el caso más común en
// beta) la pantalla quedaba "header + hueco". Este rediseño NO añade datos
// nuevos al modelo: reordena y da peso visual a lo que YA existía —
// `instagram`/`linkedin`/`web`/`radioKm` se guardaban desde el wizard y no
// se pintaban en ningún sitio (auditoría antes de tocar nada); los otros
// cuatro badges de confianza (`BadgesNetwork`) solo se usaba
// `experienciaVerificada`, folded en el pill "Perfil verificado" de
// arriba — el resto (email/referencia/identidad/actividad) vive ahora en
// una tarjeta "Confianza" con `ListaBadgesNetwork`, componente que YA
// existía (usado en /network/mi-perfil) y ya sabe no pintar nada si no hay
// ninguna señal cierta.
//
// Un solo componente para las dos vistas (propia y de un estudio): esta
// ruta SIEMPRE fue de solo lectura — quien edita lo hace en
// /network/mi-perfil (panel aparte), nunca aquí. No se mezcla edición con
// descubrimiento (pedido explícito de esta ronda): esta página se queda
// puramente presentacional, como ya era.
//
// `ficha-layout.tsx` (Seccion/FilaStat) se comparte con el panel interno
// (app/(dashboard)/network/[perfilId]/page.tsx) — se sigue citando FilaStat
// tal cual para la fila de stats del hero (sin tocar el componente), pero
// las secciones de cuerpo pasan a maquetación propia de este fichero para
// poder darles el tratamiento editorial pedido sin arriesgar la vista del
// panel, que usa la rama NO-tokensNetworkV2 del mismo componente.
//
// "Modalidad presencial/online" y "colaboraciones"/"actividad" del brief
// original NO tienen campo en el modelo — no se han inventado; el brief
// pedía explícitamente no fabricar datos que no existan.

const cargar = cache(async (slug: string) => {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const detalle = await obtenerPerfilPublicoPorSlug(admin, slug);
  if (!detalle || 'error' in detalle) return null;
  return detalle;
});

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

/** Cabecera de sección con icono — mismo peso visual en todas, para que el
    perfil se lea como capítulos de una misma historia, no como una lista
    de tarjetas sueltas. */
function TituloSeccion({ icono: Icono, children }: { icono: React.ComponentType<{ size?: number; color?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icono size={17} color={NW_PRODUCTO} />
      <h2 className="text-[13px] font-extrabold uppercase tracking-[.08em]" style={{ color: NW_MUTED_2 }}>{children}</h2>
    </div>
  );
}

/** Franja de disponibilidad — pedido explícito: "no quiero un simple texto
    pequeño, es una de las razones principales por las que un estudio entra
    a un perfil". Los cuatro estados son los únicos que existen en el
    catálogo (DISPONIBILIDAD_ESTADOS_NETWORK); "disponible"/"sustituciones"/
    "buscando trabajo" son las tres lecturas positivas ("está abierta a
    algo"), solo "no disponible" cambia de color. */
const DISPONIBILIDAD_ABIERTA = new Set(['disponible', 'disponible_sustituciones', 'buscando_trabajo']);

function BandaDisponibilidad({
  estado, horarios,
}: {
  estado: keyof typeof DISPONIBILIDAD_ESTADO_LABEL;
  horarios: readonly string[];
}) {
  const abierta = DISPONIBILIDAD_ABIERTA.has(estado);
  const color = abierta ? NW_ESTADO.verificada.color : NW_MUTED;
  const fondo = abierta ? NW_ESTADO.verificada.fondo : NW_SAND;
  return (
    <div className="rounded-[22px] px-6 py-5 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ background: fondo }}>
      <div className="flex items-center gap-2.5">
        <CircleDot size={18} color={color} fill={abierta ? color : 'none'} />
        <p className="text-[16px] font-extrabold" style={{ color }}>
          {(DISPONIBILIDAD_ESTADO_LABEL as Record<string, string>)[estado]}
        </p>
      </div>
      {horarios.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {horarios.map(h => (
            <span key={h} className="px-2.5 py-1 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,.6)', color }}>
              {(HORARIO_LABEL as Record<string, string>)[h]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function PerfilInstructoraPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detalle = await cargar(slug);
  if (!detalle) notFound();

  const { perfil, experiencias, certificaciones, badges, resenas, mediaFotos, estudiosActuales } = detalle;

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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: LEGAL.url },
      { '@type': 'ListItem', position: 2, name: 'Instructoras', item: `${LEGAL.url}/network/instructoras` },
      { '@type': 'ListItem', position: 3, name: perfil.nombre, item: url },
    ],
  };

  // Sin iconos de marca (Instagram/LinkedIn no están en lucide-react desde
  // que se separaron los iconos de marca del paquete base) — AtSign para
  // los dos perfiles sociales, Globe para la web; el `aria-label` de cada
  // enlace es lo que de verdad distingue la plataforma.
  const redesSociales = [
    perfil.instagram ? { icono: AtSign, label: 'Instagram', href: hrefDeRedSocial(perfil.instagram, 'instagram.com') } : null,
    perfil.linkedin ? { icono: AtSign, label: 'LinkedIn', href: hrefDeRedSocial(perfil.linkedin, 'linkedin.com') } : null,
    perfil.web ? { icono: Globe, label: 'Web', href: hrefDeWeb(perfil.web) } : null,
  ].filter(Boolean) as { icono: typeof AtSign; label: string; href: string }[];

  const hayConfianza = badges.emailVerificado || badges.referenciaProfesional || badges.identidadVerificada || badges.activaRecientemente;

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <NavPublico />

      <div className="max-w-[1240px] mx-auto px-6 pt-8 pb-24">
        <Link href="/network/instructoras" className="inline-flex items-center gap-1.5 text-[13px] font-semibold mb-6" style={{ color: NW_MUTED }}>
          <ArrowLeft size={14} /> Volver a instructoras
        </Link>

        {/* HERO */}
        <div className="grid lg:grid-cols-[420px_1fr] gap-10">
          <div className="relative isolate">
            <div
              aria-hidden="true"
              className="hidden lg:block absolute -right-4 -bottom-4 w-32 h-32 -z-10 rounded-[22px]"
              style={{ background: NW_PRODUCTO, transform: 'rotate(-8deg)' }}
            />
            <FotoInstructora fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} aspectRatio="4 / 4.8" radius={26} eager />
          </div>

          <div>
            {badges.experienciaVerificada && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold mb-3" style={{ background: NW_ESTADO.verificada.fondo, color: NW_ESTADO.verificada.color }}>
                <BadgeCheck size={14} /> Perfil verificado
              </span>
            )}
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[44px] sm:text-[56px] font-extrabold leading-[0.98] tracking-tight">{perfil.nombre}</h1>
              <div className="shrink-0 mt-2 flex items-center gap-3">
                <BotonCompartirPerfil url={url} compacto />
                <BotonFavoritoAlumna tipo="instructora" id={perfil.id} compacto />
              </div>
            </div>
            <p className="mt-2 text-[16px] font-bold italic" style={{ color: NW_PRODUCTO }}>
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
                <span className="flex items-center gap-1"><MapPin size={14} />{perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}</span>
              )}
              {redesSociales.length > 0 && (
                <span className="flex items-center gap-3">
                  {redesSociales.map(r => (
                    <a key={r.label} href={r.href} target="_blank" rel="noreferrer noopener" aria-label={r.label} className="hover:opacity-70 transition-opacity" style={{ color: NW_MUTED }}>
                      <r.icono size={15} />
                    </a>
                  ))}
                </span>
              )}
            </div>

            {/* Resumen rápido — "quién es, qué hace, dónde está, qué
                experiencia tiene, qué busca" en 10 segundos. Idiomas y
                radio de desplazamiento son campos que ya se guardaban
                (paso "Tu perfil"/"Dónde trabajas" del wizard) sin pintarse
                en ningún sitio del perfil público. */}
            <div className="mt-6 pt-6 grid grid-cols-2 sm:grid-cols-3 gap-4" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
              {perfil.aniosExperiencia != null && <FilaStat tokensNetworkV2 valor={`${perfil.aniosExperiencia}`} etiqueta="años de experiencia" />}
              {experiencias.length > 0 && (
                <FilaStat tokensNetworkV2
                  valor={`${new Set(experiencias.map(e => e.studioId ?? e.nombreEstudio)).size}`}
                  etiqueta="estudios"
                />
              )}
              {perfil.idiomas.length > 0 && <FilaStat tokensNetworkV2 valor={perfil.idiomas.join(' · ')} etiqueta="idiomas" />}
              <FilaStat tokensNetworkV2 valor={perfil.tipoTrabajo.length > 0 ? perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).slice(0, 2).join(' · ') : '—'} etiqueta="disponible para" />
              <FilaStat tokensNetworkV2 valor={perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'} etiqueta="tarifa orientativa" destacado />
              {perfil.radioKm != null && <FilaStat tokensNetworkV2 valor={`${perfil.radioKm} km`} etiqueta="se desplaza hasta" destacado />}
            </div>
          </div>
        </div>

        {/* Disponibilidad — pieza propia, ya no repartida entre la fila de
            stats de arriba y una sección de "Horarios" al final. */}
        <div className="mt-10">
          <BandaDisponibilidad estado={perfil.disponibilidadEstado} horarios={perfil.disponibilidadHorarios} />
        </div>

        <div className="mt-14 grid lg:grid-cols-[1fr_360px] gap-14">
          {/* Columna principal — visible en TODAS las anchuras (a
              diferencia del aside de contacto, que en móvil se sustituye
              por la barra fija de abajo): Confianza y "Actualmente en" son
              contenido informativo, no solo un atajo al CTA, así que no
              pueden desaparecer en móvil. */}
          <div className="space-y-10">
            {hayConfianza && (
              <section>
                <TituloSeccion icono={ShieldCheck}>Confianza</TituloSeccion>
                <div className="rounded-[20px] p-5" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
                  <ListaBadgesNetwork badges={badges} />
                </div>
              </section>
            )}

            {perfil.descripcion && (
              <section>
                <TituloSeccion icono={BadgeCheck}>Sobre mí</TituloSeccion>
                <BioExpandible texto={perfil.descripcion} color="#4A5347" colorAccion={NW_PRODUCTO} />
              </section>
            )}

            {perfil.especialidades.length > 0 && (
              <section>
                <TituloSeccion icono={Star}>Especialidades</TituloSeccion>
                <div className="flex flex-wrap gap-2">
                  {perfil.especialidades.map(e => (
                    <span
                      key={e}
                      className="px-[18px] py-[9px] rounded-full text-[13.5px] font-bold"
                      style={{ background: NW_SAGE, color: NW_TINTA, border: `1px solid ${NW_BORDE}` }}
                    >
                      {ESPECIALIDAD_LABEL[e]}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {estudiosActuales.length > 0 && (
              <section>
                <TituloSeccion icono={Building2}>Actualmente en</TituloSeccion>
                <div className="grid sm:grid-cols-2 gap-3">
                  {estudiosActuales.map((e, i) => (
                    <div key={`${e.nombre}-${i}`} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
                      <div className="shrink-0 mt-0.5" style={{ color: NW_PRODUCTO }}><Building2 size={16} /></div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{e.nombre}</p>
                        {e.ciudad && <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{e.ciudad}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {experiencias.length > 0 && (
              <section>
                <TituloSeccion icono={Briefcase}>Experiencia</TituloSeccion>
                <div className="relative">
                  <div aria-hidden="true" className="absolute left-[19px] top-2 bottom-2 w-px" style={{ background: NW_BORDE }} />
                  <div className="space-y-6">
                    {experiencias.map(exp => (
                      <div key={exp.id} className="relative flex gap-4">
                        <div
                          className="relative z-10 shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-extrabold"
                          style={{ background: NW_SAND, color: NW_TINTA, border: `2px solid ${NW_FONDO}` }}
                        >
                          {exp.nombreEstudio.charAt(0).toUpperCase()}
                        </div>
                        <div className="pt-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[15px] font-bold" style={{ color: NW_TINTA }}>{exp.nombreEstudio}</p>
                            {exp.estadoVerificacion === 'confirmada' && <BadgeCheck size={14} color={NW_PRODUCTO} />}
                          </div>
                          <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                          {exp.descripcion && <p className="text-[13.5px] mt-1.5 leading-[1.6]" style={{ color: NW_MUTED }}>{exp.descripcion}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {certificaciones.length > 0 && (
              <section>
                <TituloSeccion icono={GraduationCap}>Formación</TituloSeccion>
                <div className="grid sm:grid-cols-2 gap-3">
                  {certificaciones.map((c, i) => (
                    <div key={`${c.nombre}-${i}`} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
                      <div className="shrink-0 mt-0.5" style={{ color: NW_PRODUCTO }}><GraduationCap size={16} /></div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{c.nombre}</p>
                        <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{c.institucion}{c.anio ? ` · ${c.anio}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {mediaFotos.length > 0 && (
              <section>
                <TituloSeccion icono={Images}>Portfolio</TituloSeccion>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {mediaFotos.map((m, i) => (
                    <div
                      key={m.id}
                      className={`overflow-hidden rounded-2xl ${i === 0 && mediaFotos.length >= 3 ? 'col-span-2 row-span-2' : ''}`}
                      style={{ background: NW_SAND, aspectRatio: '1 / 1' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta, no vale la pena que next/image la cachee */}
                      <img
                        src={m.url} alt="" loading="lazy" decoding="async"
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.04]"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resenas.length > 0 && (
              <section>
                <TituloSeccion icono={Star}>{`Opiniones · ${perfil.resumenResenas.promedio ?? '—'} de ${resenas.length}`}</TituloSeccion>
                <div className="space-y-4">
                  {resenas.map(r => (
                    <div key={r.id} className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }, (_, j) => (
                            <Star key={j} size={14} style={{ color: j < r.puntuacion ? NW_ESTRELLA : NW_BORDE }} fill="currentColor" />
                          ))}
                        </div>
                        <span className="text-[12px]" style={{ color: NW_MUTED_2 }}>{r.estudioNombre}</span>
                      </div>
                      {r.comentario && <p className="text-[14px] leading-[1.65] mt-2" style={{ color: '#4A5347' }}>{r.comentario}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <FormularioResenaAlumna tipo="instructora" id={perfil.id} nombre={perfil.nombre} />
          </div>

          {/* Aside sticky — oculto en móvil, sustituido por la barra fija de
              abajo. Solo el CTA de contacto: el resto de contenido
              informativo vive en la columna principal, visible en toda
              anchura. */}
          <aside className="hidden lg:block self-start sticky top-24">
            <div className="bg-white rounded-[22px] p-6" style={{ border: `1px solid ${NW_BORDE}` }}>
              <p className="text-[17px] font-extrabold">
                ¿Quieres contactar con {perfil.nombre.split(' ')[0]}?
              </p>
              <div className="mt-4">
                <BotonContactar perfilId={perfil.id} nombre={perfil.nombre} />
              </div>
              <div className="mt-5 pt-5 space-y-2 text-[13px]" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
                {perfil.ciudad && <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Zona</span><span className="font-semibold">{perfil.ciudad}</span></div>}
                <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Disponibilidad</span><span className="font-semibold">{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</span></div>
                <div className="flex justify-between"><span style={{ color: NW_MUTED_2 }}>Precio</span><span className="font-semibold">{perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'}</span></div>
                {perfil.radioKm != null && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1" style={{ color: NW_MUTED_2 }}><Navigation size={11} /> Se desplaza</span>
                    <span className="font-semibold">hasta {perfil.radioKm} km</span>
                  </div>
                )}
              </div>
              <p className="mt-4 text-[11.5px] rounded-lg px-3 py-2.5" style={{ background: NW_SAND, color: NW_MUTED }}>
                Sin comisiones: contactas directamente con {perfil.nombre.split(' ')[0]}.
              </p>
              <div className="mt-4 pt-4 flex items-center justify-center gap-4" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
                <BotonCompartirPerfil url={url} />
                <BotonReportar perfilId={perfil.id} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* CTA sticky inferior en móvil (1e frame 2). */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 p-4 pt-8"
        style={{ background: `linear-gradient(to top, ${NW_FONDO} 55%, transparent)` }}
      >
        <div className="bg-white rounded-2xl p-3 flex items-center justify-between gap-3" style={{ border: `1px solid ${NW_BORDE}`, boxShadow: '0 -8px 24px rgba(34,42,51,.1)' }}>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold truncate" style={{ color: NW_TINTA }}>Contactar con {perfil.nombre.split(' ')[0]}</p>
            <p className="text-[11px]" style={{ color: NW_MUTED_2 }}>
              {perfil.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[perfil.tarifaRango]}` : 'Tarifa a consultar'}
            </p>
          </div>
          <BotonContactar perfilId={perfil.id} nombre={perfil.nombre} compacto />
        </div>
      </div>

      <div className="pb-36 lg:pb-0">
        <PieNetwork />
      </div>
    </div>
  );
}
