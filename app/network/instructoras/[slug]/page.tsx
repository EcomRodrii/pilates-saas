import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Star, MapPin, GraduationCap, Building2 } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { obtenerPerfilPublicoPorSlug } from '@/lib/network/publico';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { BotonContactar, BotonReportar } from '@/components/network-publico/boton-contactar';
import { BotonFavoritoAlumna } from '@/components/network/boton-favorito-alumna';
import { FormularioResenaAlumna } from '@/components/network/formulario-resena-alumna';
import { rangoAnios } from '@/lib/network/formato';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
  tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_SAGE, NW_SAND, NW_BORDE, NW_PRODUCTO, NW_ESTRELLA, NW_ESTADO } from '@/components/network-v2/tokens';

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

// cache(): generateMetadata() y PerfilInstructoraPage() llaman los dos a
// cargar() para el mismo slug — sin memoizar por request, Next ejecuta las
// ~6-7 queries de obtenerPerfilPublicoPorSlug DOS VECES por carga de página
// (auditoría de performance, 2026-08-18). A diferencia de fetch(), las
// llamadas de supabase-js no se dedupean solas; React.cache() sí lo hace
// dentro del mismo render.
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

// `destacado`: tarifa y estado de disponibilidad son los dos datos que de
// verdad deciden un "me interesa" rápido — antes pesaban exactamente igual
// que "nº de estudios" o "disponible para", cuatro stats idénticos en fila
// sin ninguna jerarquía entre ellos (auditoría UX, 2026-08-18). El resto se
// queda con el peso discreto de siempre.
function FilaStat({ valor, etiqueta, destacado = false }: { valor: string; etiqueta: string; destacado?: boolean }) {
  return (
    <div>
      <p className={destacado ? 'text-[22px] font-extrabold' : 'text-[18px] font-bold'} style={{ color: destacado ? NW_PRODUCTO : NW_TINTA }}>{valor}</p>
      <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>{etiqueta}</p>
    </div>
  );
}

// `compacta`: "Formación" es la única sección que no ayuda a decidir rápido
// (certificaciones ya verificadas, información de refuerzo, no de
// diagnóstico) — antes tenía el mismo H2 de 22px que "Sobre mí"/"Experiencia"/
// "Opiniones", pesando igual que datos con más peso real para la decisión.
function Seccion({ titulo, children, compacta = false }: { titulo: string; children: React.ReactNode; compacta?: boolean }) {
  return (
    <section>
      <h2 className={compacta ? 'text-[15px] font-bold uppercase tracking-wide' : 'text-[22px] font-extrabold'} style={{ color: compacta ? NW_MUTED_2 : NW_TINTA }}>{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
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
              <div className="shrink-0 mt-2">
                <BotonFavoritoAlumna tipo="instructora" id={perfil.id} compacto />
              </div>
            </div>
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
                <span className="flex items-center gap-1"><MapPin size={14} />{perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}</span>
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
              <FilaStat valor={perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'} etiqueta="tarifa orientativa" destacado />
              <FilaStat valor={DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]} etiqueta="estado" destacado />
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

            {/* Dato ya existía en BD y en el filtro de búsqueda, pero nunca
                se pintaba en el perfil (auditoría UX, 2026-08-18). En el
                bloque de body (visible en mobile), no solo en el aside, que
                está oculto ahí. */}
            {perfil.idiomas.length > 0 && (
              <Seccion titulo="Idiomas" compacta>
                <p className="text-[14px]" style={{ color: NW_TINTA }}>{perfil.idiomas.join(', ')}</p>
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
                          {exp.estadoVerificacion === 'confirmada' && <BadgeCheck size={14} color={NW_PRODUCTO} />}
                        </div>
                        <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{rangoAnios(exp.fechaInicio, exp.fechaFin)}</p>
                        {exp.descripcion && <p className="text-[13.5px] mt-1" style={{ color: NW_MUTED }}>{exp.descripcion}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {estudiosActuales.length > 0 && (
              <Seccion titulo="Actualmente en" compacta>
                <div className="space-y-3">
                  {estudiosActuales.map((e, i) => (
                    <div key={`${e.nombre}-${i}`} className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5" style={{ color: NW_PRODUCTO }}><Building2 size={16} /></div>
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{e.nombre}</p>
                        {e.ciudad && <p className="text-[13px]" style={{ color: NW_MUTED_2 }}>{e.ciudad}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {certificaciones.length > 0 && (
              <Seccion titulo="Formación" compacta>
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

            {mediaFotos.length > 0 && (
              <Seccion titulo="Portfolio" compacta>
                <div className="grid grid-cols-3 gap-2">
                  {mediaFotos.map(m => (
                    <div key={m.id} className="aspect-square rounded-lg overflow-hidden" style={{ background: NW_SAND }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta, no vale la pena que next/image la cachee */}
                      <img src={m.url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </div>
                  ))}
                </div>
              </Seccion>
            )}

            {/* El estado de disponibilidad y "disponible para" ya viven en
                la fila de stats de cabecera — esta sección solo aporta dato
                nuevo cuando hay franjas horarias (auditoría UX, 2026-08-18:
                antes repetía el mismo estado dos veces en la misma pantalla). */}
            {perfil.disponibilidadHorarios.length > 0 && (
              <Seccion titulo="Horarios">
                <div className="flex flex-wrap gap-2">
                  {perfil.disponibilidadHorarios.map(h => (
                    <span key={h} className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}>
                      {HORARIO_LABEL[h]}
                    </span>
                  ))}
                </div>
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
                            <Star key={j} size={14} style={{ color: j < r.puntuacion ? NW_ESTRELLA : NW_BORDE }} fill="currentColor" />
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

            {/* Solo se pinta si el servidor confirma elegibilidad — ver
                components/network/formulario-resena-alumna.tsx. */}
            <FormularioResenaAlumna tipo="instructora" id={perfil.id} nombre={perfil.nombre} />
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
        style={{ background: `linear-gradient(to top, ${NW_FONDO} 55%, transparent)` }}
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

      {/* pb-36 (144px, > los ~134px medidos del CTA sticky de arriba):
          `pb-24` del contenedor de arriba solo reserva hueco DENTRO de esa
          columna, PieNetwork es un hermano fuera de ella — sin este
          padding, el CTA fijo tapaba el pie entero en móvil (auditoría
          mobile-first, 2026-08-18: "Privacidad" y "Parte del ecosistema
          Tentare" quedaban inalcanzables incluso haciendo scroll hasta el
          final). Solo en móvil (lg:pb-0): el CTA es lg:hidden. */}
      <div className="pb-36 lg:pb-0">
        <PieNetwork />
      </div>
    </div>
  );
}
