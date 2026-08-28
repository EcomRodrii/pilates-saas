'use client';

// FICHA DEL ESTUDIO — reencuadre del "DETALLE ESTUDIO" de Tentare Studio App.
//
// El diseño original lo pensaba como la ficha de UN ESTUDIO CUALQUIERA dentro
// de un descubrimiento cruzado entre estudios (Tentare Network). Esa pieza
// está descartada como decisión de producto — el portal se queda mono-estudio
// — así que aquí es la ficha del PROPIO estudio de la socia: dónde entrena,
// sin ningún concepto de "elegir estudio". Hero+galería, mini-horario (atajo
// a /clases, no una reimplementación del calendario) y equipo, todo con datos
// reales de useStudio(). Sin descubrimiento cruzado, sin datos inventados.
//
// Opiniones: no existe ningún sistema real de reseñas ESCRITAS sobre el
// propio estudio — lo único parecido en el repo (`red_resenas`,
// app/api/network/resenas/) es de Tentare Network (una PROPIETARIA reseñando
// a una instructora tras un contacto aceptado), fuera de alcance aquí por el
// mismo motivo que el descubrimiento cruzado. Lo que SÍ es real es
// `valoracionEstudio` (agregado de las valoraciones de instructoras del
// estudio, ya mostrado en "Tu estudio" del Inicio) — se reutiliza tal cual,
// con el mismo umbral mínimo (`valoracionParaPantalla`); las tarjetas de
// opinión con texto/nombre/fecha del diseño original NO tienen ninguna fuente
// real detrás y se omiten enteras.

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Star, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { display, micro, escala } from '@/lib/portal-design';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';
import {
  imagenDeEstudio, imagenDeClase, alFallarImagen, IMAGENES_POR_DEFECTO, IMAGENES_CLASE,
} from '@/lib/imagenes-por-defecto';
import { queImparten } from '@/lib/equipo';
import { hoyEnEstudio, horaEstudio, TZ_ESTUDIO } from '@/lib/utils';
import { AforoIndicator } from '@/components/portal/ui/AforoIndicator';
import type { Reserva, Sesion } from '@/lib/types';

const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'];
const DIAS_MOSTRADOS = 6;
/** Umbral de arrastre (px) para cerrar la ficha con el gesto de borde. */
const UMBRAL_SWIPE = 110;

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function etiquetaDia(fecha: Date, esHoy: boolean): string {
  if (esHoy) return 'Hoy';
  const letra = new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: TZ_ESTUDIO }).format(fecha);
  return letra.charAt(0).toUpperCase() + letra.slice(1).replace('.', '');
}

export default function EstudioFichaPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const {
    studio, tiposClase, instructores, sesiones, reservas, valoracionEstudio,
  } = useStudio();
  const { t } = useModo();

  const [diaIdx, setDiaIdx] = useState(0);
  const [fotoAbierta, setFotoAbierta] = useState<{ src: string; alt: string } | null>(null);

  // Gesto de swipe-back: solo en el borde izquierdo (26px, como el diseño
  // original), para no robarle el scroll horizontal a la galería.
  const arrastrando = useRef(false);
  const origenX = useRef(0);
  const [dragX, setDragX] = useState(0);

  const dias = useMemo(() => {
    const hoy = new Date();
    const hoyClave = hoyEnEstudio(hoy);
    return Array.from({ length: DIAS_MOSTRADOS }, (_, i) => {
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() + i);
      const clave = hoyEnEstudio(fecha);
      const esHoy = clave === hoyClave;
      return { fecha, clave, esHoy, etiqueta: etiquetaDia(fecha, esHoy) };
    });
  }, []);

  const diaSeleccionado = dias[diaIdx] ?? dias[0];

  const ocupadas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of reservas) {
      if (!OCUPA_PLAZA.includes(r.estado)) continue;
      mapa.set(r.sesionId, (mapa.get(r.sesionId) ?? 0) + 1);
    }
    return mapa;
  }, [reservas]);

  const clasesDelDia = useMemo((): Sesion[] => {
    if (!diaSeleccionado) return [];
    const ahora = new Date();
    return sesiones
      .filter(s => !s.cancelada && hoyEnEstudio(new Date(s.inicio)) === diaSeleccionado.clave)
      .filter(s => !diaSeleccionado.esHoy || new Date(s.inicio) > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [sesiones, diaSeleccionado]);

  const equipo = useMemo(() => queImparten(instructores), [instructores]);

  const galeria = useMemo(() => {
    const vistas = new Set<string>();
    const fotos: { src: string; alt: string }[] = [];
    const hero = imagenDeEstudio('portada', studio?.imagenBienvenidaUrl);
    fotos.push({ src: hero, alt: studio?.nombre ?? 'El estudio' });
    vistas.add(hero);
    for (const tc of tiposClase) {
      const src = imagenDeClase(tc);
      if (vistas.has(src)) continue;
      vistas.add(src);
      fotos.push({ src, alt: tc.nombre });
      if (fotos.length >= 6) break;
    }
    return fotos;
  }, [studio, tiposClase]);

  const valoracion = valoracionParaPantalla(valoracionEstudio);

  const tags = useMemo(() => {
    const lista: string[] = [];
    if (studio?.ciudad) lista.push(studio.ciudad);
    if (studio?.anioFundacion) lista.push(`Desde ${studio.anioFundacion}`);
    if (tiposClase.length > 0) lista.push(`${tiposClase.length} ${tiposClase.length === 1 ? 'disciplina' : 'disciplinas'}`);
    return lista.slice(0, 3);
  }, [studio, tiposClase]);

  if (!studio) return null;

  const heroSrc = galeria[0]?.src ?? IMAGENES_POR_DEFECTO.portada[0];
  const direccion = [studio.direccion, studio.ciudad].filter(Boolean).join(', ');

  return (
    <div
      style={{
        minHeight: '100%', background: t.bg, position: 'relative',
        transform: dragX ? `translateX(${dragX}px)` : undefined,
      }}
    >
      {/* Borde izquierdo: arrastrar hacia la derecha cierra la ficha, como el
          gesto de "swipe-back" del diseño original. */}
      <div
        aria-hidden="true"
        onPointerDown={(e) => { arrastrando.current = true; origenX.current = e.clientX; }}
        onPointerMove={(e) => {
          if (!arrastrando.current) return;
          setDragX(Math.max(0, e.clientX - origenX.current));
        }}
        onPointerUp={() => {
          arrastrando.current = false;
          if (dragX > UMBRAL_SWIPE) router.push(`/portal/${slug}/home`);
          setDragX(0);
        }}
        onPointerCancel={() => { arrastrando.current = false; setDragX(0); }}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 26, zIndex: 6, touchAction: 'none' }}
      />

      {/* Hero con Ken Burns */}
      <div style={{ position: 'relative', height: 290, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroSrc}
          alt={studio.nombre}
          onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
          className="portal-estudio-hero-img"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,15,.36), rgba(15,15,15,0) 36%, rgba(15,15,15,0) 55%, rgba(15,15,15,.64))' }}
        />
        <Link
          href={`/portal/${slug}/home`}
          aria-label="Volver"
          style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 14, width: 34, height: 34,
            borderRadius: 999, background: 'rgba(250,249,245,.92)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#1A1A1A', textDecoration: 'none',
          }}
        >
          <ChevronLeft size={18} />
        </Link>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, color: '#fff' }}>
          <p style={{ ...micro(10.5, 0.14, 700), margin: 0, color: 'rgba(255,255,255,.85)' } as React.CSSProperties}>Tu estudio</p>
          <h1 style={{ ...display(25), margin: '2px 0 0', color: '#fff', letterSpacing: '-0.02em' }}>{studio.nombre}</h1>
          {direccion && (
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,.85)' }}>{direccion}</p>
          )}
          {(tags.length > 0 || valoracion) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {valoracion && (
                <span style={{
                  background: 'rgba(250,249,245,.2)', border: '1px solid rgba(255,255,255,.45)', borderRadius: 999,
                  padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, ...micro(10.5, 0, 700),
                } as React.CSSProperties}>
                  <Star size={10} fill="#fff" color="#fff" /> {valoracion.nota}
                </span>
              )}
              {tags.map(tag => (
                <span key={tag} style={{
                  background: 'rgba(250,249,245,.2)', border: '1px solid rgba(255,255,255,.45)', borderRadius: 999,
                  padding: '4px 10px', ...micro(10.5, 0, 700),
                } as React.CSSProperties}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 0 40px' }}>
        {/* Galería */}
        {galeria.length > 1 && (
          <div style={{ display: 'flex', gap: 9, padding: '0 16px 4px', overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {galeria.map((foto, i) => (
              <button
                key={foto.src + i}
                type="button"
                onClick={() => setFotoAbierta(foto)}
                style={{
                  width: 150, height: 96, borderRadius: 14, overflow: 'hidden', flexShrink: 0, border: 'none',
                  padding: 0, cursor: 'zoom-in', scrollSnapAlign: 'start',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.src}
                  alt={foto.alt}
                  onError={alFallarImagen(IMAGENES_CLASE.generica)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '18px 16px 0' }}>
          {studio.descripcion && (
            <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: t.muted }}>{studio.descripcion}</p>
          )}

          {/* Mini-selector de horario — atajo a /clases, no un calendario */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 10px' }}>
            <h2 style={{ ...display(escala('seccion', 20)), color: t.ink, margin: 0 }}>Horario</h2>
            <Link href={`/portal/${slug}/clases`} style={{ ...micro(9.5, 0.18, 600), color: t.heroAccent, textDecoration: 'none' } as React.CSSProperties}>
              Ver horario completo →
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
            {dias.map((d, i) => {
              const activo = i === diaIdx;
              return (
                <button
                  key={d.clave}
                  type="button"
                  onClick={() => setDiaIdx(i)}
                  style={{
                    flexShrink: 0, padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    border: activo ? 'none' : `1px solid ${t.line}`,
                    background: activo ? 'var(--portal-brand)' : t.surface,
                    color: activo ? 'var(--portal-brand-foreground)' : t.muted,
                    cursor: 'pointer',
                  }}
                >
                  {d.etiqueta}
                </button>
              );
            })}
          </div>

          {clasesDelDia.length === 0 ? (
            <p style={{ fontSize: 13, color: t.muted, padding: '8px 2px 4px' }}>
              Sin clases {diaSeleccionado?.esHoy ? 'por delante hoy' : 'ese día'}.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clasesDelDia.slice(0, 6).map(s => {
                const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
                const inst = instructores.find(i => i.id === s.instructorId);
                const libres = s.aforoMaximo - (ocupadas.get(s.id) ?? 0);
                return (
                  <Link
                    key={s.id}
                    href={`/portal/${slug}/clases/${s.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, background: t.surface, border: `1px solid ${t.line}`,
                      borderRadius: 14, padding: '11px 13px', textDecoration: 'none',
                    }}
                  >
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color: t.ink, minWidth: 42 }}>
                      {horaEstudio(s.inicio)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: t.ink }}>{tipo?.nombre ?? 'Clase'}</p>
                      <p style={{ margin: '1px 0 0', fontSize: 10.5, color: t.muted }}>
                        {[inst?.nombre, tipo ? `${tipo.duracionMinutos} min` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <AforoIndicator libres={libres} />
                  </Link>
                );
              })}
            </div>
          )}

          {/* Equipo */}
          {equipo.length > 0 && (
            <>
              <h2 style={{ ...display(escala('seccion', 20)), color: t.ink, margin: '26px 0 10px' }}>Instructoras</h2>
              <div style={{ display: 'flex', gap: 9, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {equipo.map(inst => {
                  const nota = valoracionParaPantalla(inst.valoracion ?? null);
                  return (
                    <Link
                      key={inst.id}
                      href={`/portal/${slug}/instructores/${inst.id}`}
                      style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, background: t.surface,
                        border: `1px solid ${t.line}`, borderRadius: 999, padding: '6px 13px 6px 6px', textDecoration: 'none',
                      }}
                    >
                      {inst.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={inst.fotoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 999, objectFit: 'cover' }} />
                      ) : (
                        <span style={{
                          width: 30, height: 30, borderRadius: 999, backgroundColor: inst.color, color: '#fff',
                          fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {iniciales(inst.nombre)}
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.ink, whiteSpace: 'nowrap' }}>
                        {inst.nombre.split(' ')[0]}
                        {nota && <span style={{ color: t.heroAccent }}> ★ {nota.nota}</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {/* Opiniones — SOLO el agregado real (valoracionEstudio), sin
              tarjetas de reseña: no hay ninguna fuente real de opiniones
              escritas sobre el propio estudio (ver comentario de cabecera). */}
          {valoracion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 26 }}>
              <Star size={14} fill={t.heroAccent} color={t.heroAccent} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{valoracion.nota}</span>
              <span style={{ fontSize: 12, color: t.muted }}>({valoracion.respaldo}, de todo el equipo)</span>
            </div>
          )}

          <Link
            href={`/portal/${slug}/clases`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 999,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontSize: 14.5, fontWeight: 800,
              textDecoration: 'none', marginTop: 26,
            }}
          >
            Ver horario completo
          </Link>
        </div>
      </div>

      {/* Visor de foto a pantalla completa */}
      {fotoAbierta && (
        <div
          onClick={() => setFotoAbierta(null)}
          className="portal-estudio-visor"
          style={{
            position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,10,8,.93)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoAbierta.src}
            alt={fotoAbierta.alt}
            style={{ width: '88%', maxWidth: 480, aspectRatio: '4 / 3', borderRadius: 16, objectFit: 'cover', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}
          />
          <button
            type="button"
            onClick={() => setFotoAbierta(null)}
            aria-label="Cerrar"
            style={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top) + 16px)', right: 18, background: 'none',
              border: 'none', color: 'rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <X size={14} /> cerrar
          </button>
        </div>
      )}
    </div>
  );
}
