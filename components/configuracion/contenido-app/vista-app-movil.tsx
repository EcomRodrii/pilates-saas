'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FilaTarjetas, Tarjeta } from '@/components/student/domain/Descubre';
import { MarcoIphone, PANTALLA_IPHONE, useEscalaIphone } from '@/components/ui/marco-iphone';
import { FranjaMensaje } from '@/components/student/domain/MensajeDestacado';
import { Icono } from '@/components/student/ui/Icono';
import type { NombreIcono } from '@/components/student/ui/Icono';
import type { TarjetaDescubre } from '@/lib/student/descubre';
import { ratioContraste } from '@/lib/wcag-contrast';
import { VARIABLES_APP } from '@/components/student/ui/variables-app';

// «Así lo ven tus alumnas»: el inicio de su app en un móvil, a la derecha de
// «Contenido de tu app» v2 (como Apariencia). Las TARJETAS y la FRANJA son las
// piezas de verdad de la app (`Tarjeta`, `FranjaMensaje`), con lo que hay ahora
// mismo, también lo que aún se está escribiendo; el resto del inicio (la próxima
// clase, los huecos) va de ejemplo, para ver dónde cae cada cosa.
//
// No es un iframe de la app (como sí lo es Apariencia): el catálogo público se
// cachea 60 s y lo publicado tardaría en salir, y aquí hay que ver también la
// tarjeta que se está editando aunque no se vea («Solo la ves tú»).
//
// Las variables de `student.css` que usan esas piezas van en línea: cargar la hoja
// de la app en el panel la aplicaría a todo `.student-app`, y no hace falta.

/** Una tarjeta en la vista previa: la de la app y, si se está editando, cómo está. */
export interface TarjetaEnVista {
  id: string;
  /** `null` = sin foto: en la app no sale y aquí se pinta un hueco. */
  t: TarjetaDescubre | null;
  titulo: string;
  editando: boolean;
  /** ¿Sale hoy en su app? La que no, solo se ve aquí, y solo mientras se edita. */
  sale: boolean;
}

// La pantalla de un iPhone 17 (402 × 874) y el tamaño al que se enseña. El marco la reduce.
const ANCHO = PANTALLA_IPHONE.ancho;
const ALTO = PANTALLA_IPHONE.alto;
// La barra de pestañas de la app: 56 de pestañas y 34 del indicador de inicio.
const ALTO_PESTANAS = 90;
const ACENTO_DE_SERIE = '#3E6B4A';

const PESTANAS: { label: string; icono: NombreIcono }[] = [
  { label: 'Inicio', icono: 'inicio' },
  { label: 'Reservar', icono: 'reservar' },
  { label: 'Mis clases', icono: 'mis-clases' },
  { label: 'Mi plan', icono: 'bono' },
  { label: 'Perfil', icono: 'perfil' },
];

/** El color del estudio solo si se lee sobre blanco; si no, el de serie de la app. */
function acento(color: string | null | undefined): string {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return ACENTO_DE_SERIE;
  return (ratioContraste(color, '#FFFFFF') ?? 0) >= 3 ? color : ACENTO_DE_SERIE;
}

export function VistaAppMovil({ nombreEstudio, portadaUrl, color, mensaje, tarjetas, foco, pie }: {
  nombreEstudio: string;
  portadaUrl: string;
  color: string | null | undefined;
  /** Lo que pinta la franja: `null` = sin franja, como en la app. */
  mensaje: string | null;
  tarjetas: readonly TarjetaEnVista[];
  /** Dónde baja sola la vista y qué marca. */
  foco: 'tarjetas' | 'mensaje';
  pie: string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const zonaTarjetas = useRef<HTMLDivElement>(null);
  const fila = useRef<HTMLUListElement>(null);
  const editando = tarjetas.findIndex(x => x.editando);
  const escala = useEscalaIphone();
  // Con la portada ya fuera de la vista, la hora se lee sobre un fondo claro y no sobre la foto.
  const [bajada, setBajada] = useState(false);

  // Baja sola hasta lo que se toca. Con `scrollTo` del propio contenedor y no con
  // `scrollIntoView`, que movería también la página del panel.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const destino = foco === 'mensaje' ? 0 : Math.max(0, (zonaTarjetas.current?.offsetTop ?? 0) - 120);
    // Con «reducir movimiento», sin deslizar.
    const behavior: ScrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    el.scrollTo({ top: destino, behavior });
    // La que se edita, a la vista dentro de su fila (va en el mismo orden que `tarjetas`).
    const li = editando >= 0 ? fila.current?.children[editando] as HTMLElement | undefined : undefined;
    if (foco === 'tarjetas' && li) fila.current!.scrollTo({ left: Math.max(0, li.offsetLeft - 2), behavior });
  }, [foco, editando, tarjetas.length]);

  const vars = {
    ...VARIABLES_APP, '--t-h2': '21px', '--t-small': '14px', '--t-micro': '11px', '--t-body': '16px', '--accent': acento(color), '--px': '18px',
    // El texto sobre el color de marca. Sin esto heredaría el `--accent-foreground` del panel.
    '--accent-foreground': '#FFFFFF',
    width: ANCHO, height: ALTO,
    background: 'var(--background)', color: 'var(--foreground)', position: 'relative', overflow: 'hidden',
  } as CSSProperties;
  const marcaFoco = (activo: boolean): CSSProperties => activo
    ? { outline: '2px solid color-mix(in srgb, var(--accent) 45%, transparent)', outlineOffset: 8, borderRadius: 30 }
    : {};
  const hayTarjetas = tarjetas.length > 0;

  return (
    <figure className="m-0 flex flex-col items-center gap-3">
      <MarcoIphone
        aria-hidden
        inert
        data-testid="vista-app-movil"
        escala={escala}
        tinta={bajada ? 'oscura' : 'clara'}
        fondoBarra={bajada ? 'rgba(250,249,245,.9)' : undefined}
      >
        <div style={vars}>
          <div ref={scroll} onScroll={e => setBajada(e.currentTarget.scrollTop > 60)} className="no-scrollbar" style={{ height: ALTO - ALTO_PESTANAS, overflowY: 'auto', scrollbarWidth: 'none' }}>
            {/* La portada de su app, con su foto y el saludo (de ejemplo). */}
            <div style={{ position: 'relative', height: 236, background: '#0F0F0C', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- la foto del estudio, ya servida por su URL */}
              <img src={portadaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,.75), rgba(8,8,8,.2))' }} />
              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 40, color: '#FAF9F5' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.9 }}>{nombreEstudio}</p>
                <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: '-.03em' }}>Hola, Lucía 👋</p>
              </div>
            </div>
            <div style={{ margin: '-24px 18px 0', position: 'relative', height: 48, borderRadius: 999, background: '#FFFFFF', border: '1px solid #E5E3DA', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: '#6C7567', fontSize: 15 }}>
              <Icono nombre="buscar" tamano={18} /> Clases o instructoras…
            </div>

            {mensaje && (
              <div style={{ margin: '14px 18px 0', ...marcaFoco(foco === 'mensaje') }} data-testid="vista-franja">
                <FranjaMensaje texto={mensaje} />
              </div>
            )}

            <div style={{ margin: '16px 18px 0', borderRadius: 20, background: '#12291A', color: '#EAF0E7', padding: 16 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: 0.8 }}>Tu próxima clase · mañana</p>
              <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800 }}>Reformer · 09:30</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.85 }}>Con tu instructora · Sala 1</p>
            </div>

            <div ref={zonaTarjetas} style={{ margin: '20px 18px 0', ...marcaFoco(foco === 'tarjetas' && editando < 0) }}>
              {hayTarjetas ? (
                <>
                  <h2 style={{ margin: '0 0 9px', fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>Descubre</h2>
                  <FilaTarjetas filaRef={fila}>
                    {tarjetas.map((x, i) => {
                      const marca = x.editando ? (x.sale ? 'La estás editando' : 'Solo la ves tú') : undefined;
                      return x.t ? (
                        <Tarjeta key={x.id} t={x.t} href={() => '#'} delay={i * 55} marca={marca} resaltada={x.editando} unica={tarjetas.length === 1} />
                      ) : (
                        <li
                          key={x.id}
                          style={{
                            width: tarjetas.length === 1 ? '100%' : 'calc(100% - 40px)', aspectRatio: '16 / 9', flex: '0 0 auto', borderRadius: 24,
                            border: '2px dashed #D9D6C9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 6, color: '#5A5A52', fontSize: 14, fontWeight: 600, textAlign: 'center', padding: 12, position: 'relative',
                            scrollSnapAlign: 'start', outline: x.editando ? '3px solid var(--accent)' : undefined, outlineOffset: 2,
                          }}
                        >
                          {marca && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 8px', borderRadius: 999, background: '#EFEDE4', fontSize: 11, fontWeight: 800 }}>{marca}</span>}
                          <span>{x.titulo || 'Tarjeta sin título'}</span>
                          <span style={{ fontWeight: 500 }}>Sin foto no sale</span>
                        </li>
                      );
                    })}
                  </FilaTarjetas>
                </>
              ) : (
                <>
                  <h2 style={{ margin: '0 0 9px', fontSize: 21, fontWeight: 800, opacity: 0.45 }}>Descubre</h2>
                  <div style={{ aspectRatio: '16 / 9', borderRadius: 24, border: '2px dashed #D9D6C9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A5A52', fontSize: 14, fontWeight: 600 }}>
                    Aquí saldrán tus tarjetas
                  </div>
                </>
              )}
            </div>

            <div style={{ margin: '20px 18px 24px' }}>
              <h2 style={{ margin: '0 0 9px', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>Huecos de hoy</h2>
              {['Mat · 18:00', 'Reformer · 19:15'].map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', marginBottom: 8, borderRadius: 16, background: '#FFFFFF', border: '1px solid #E5E3DA', fontSize: 15, fontWeight: 700 }}>
                  {c}<span style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--accent)', color: '#FFFFFF', fontSize: 13 }}>Reservar</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: ALTO_PESTANAS, background: '#FFFFFF', borderTop: '1px solid #E5E3DA', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', paddingTop: 10 }}>
            {PESTANAS.map((p, i) => (
              <span key={p.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--foreground)' : 'var(--subtle-foreground)' }}>
                <Icono nombre={p.icono} tamano={22} />{p.label}
              </span>
            ))}
          </div>
        </div>
      </MarcoIphone>
      <figcaption className="max-w-[320px] rounded-xl bg-black/35 px-3 py-1.5 text-center text-[12px] leading-relaxed text-white">{pie}</figcaption>
    </figure>
  );
}
