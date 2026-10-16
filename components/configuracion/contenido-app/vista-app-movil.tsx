'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { Tarjeta } from '@/components/student/domain/Descubre';
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

const ANCHO = 390;
const ALTO = 800;
const ESCALA = 0.8;
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
    ...VARIABLES_APP, '--t-small': '14px', '--t-micro': '11px', '--t-body': '16px', '--accent': acento(color), '--px': '18px',
    width: ANCHO, height: ALTO, transform: `scale(${ESCALA})`, transformOrigin: 'top left',
    background: 'var(--background)', color: 'var(--foreground)', position: 'relative', overflow: 'hidden',
  } as CSSProperties;
  const marcaFoco = (activo: boolean): CSSProperties => activo
    ? { outline: '3px solid color-mix(in srgb, var(--accent) 55%, transparent)', outlineOffset: 4, borderRadius: 18 }
    : {};
  const hayTarjetas = tarjetas.length > 0;

  return (
    <figure className="m-0 flex flex-col items-center gap-3">
      <div
        aria-hidden
        inert
        data-testid="vista-app-movil"
        className="overflow-hidden rounded-[38px] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl"
        style={{ width: ANCHO * ESCALA + 20, height: ALTO * ESCALA + 20 }}
      >
        <div style={vars}>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 14, fontWeight: 700, background: '#0F0F0C', color: '#FAF9F5' }}>
            <span>9:41</span><span style={{ letterSpacing: 2 }}>●●●</span>
          </div>
          <div ref={scroll} className="no-scrollbar" style={{ height: ALTO - 40 - 74, overflowY: 'auto', scrollbarWidth: 'none' }}>
            {/* La portada de su app, con su foto y el saludo (de ejemplo). */}
            <div style={{ position: 'relative', height: 190, background: '#0F0F0C', overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- la foto del estudio, ya servida por su URL */}
              <img src={portadaUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,.75), rgba(8,8,8,.2))' }} />
              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 34, color: '#FAF9F5' }}>
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

            <div ref={zonaTarjetas} style={{ margin: '18px 18px 0', padding: 2, ...marcaFoco(foco === 'tarjetas') }}>
              {hayTarjetas ? (
                <>
                  <h2 style={{ margin: '0 0 9px', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>Descubre</h2>
                  <ul ref={fila} className="no-scrollbar" style={{ display: 'flex', gap: 11, margin: 0, padding: '2px 0 4px', listStyle: 'none', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {tarjetas.map((x, i) => {
                      const marca = x.editando ? (x.sale ? 'La estás editando' : 'Solo la ves tú') : undefined;
                      return x.t ? (
                        <Tarjeta key={x.id} t={x.t} href={() => '#'} delay={i * 55} marca={marca} resaltada={x.editando} />
                      ) : (
                        <li
                          key={x.id}
                          style={{
                            width: 172, height: 194, flexShrink: 0, borderRadius: 16, border: '2px dashed #D9D6C9',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                            color: '#5A5A52', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: 12, position: 'relative',
                            outline: x.editando ? '3px solid var(--accent)' : undefined, outlineOffset: 2,
                          }}
                        >
                          {marca && <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 999, background: '#EFEDE4', fontSize: 11, fontWeight: 800 }}>{marca}</span>}
                          <span>{x.titulo || 'Tarjeta sin título'}</span>
                          <span style={{ fontWeight: 500 }}>Sin foto no sale</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <h2 style={{ margin: '0 0 9px', fontSize: 20, fontWeight: 800, opacity: 0.45 }}>Descubre</h2>
                  <div style={{ height: 150, borderRadius: 16, border: '2px dashed #D9D6C9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5A5A52', fontSize: 14, fontWeight: 600 }}>
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
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 74, background: '#FFFFFF', borderTop: '1px solid #E5E3DA', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', paddingTop: 10 }}>
            {PESTANAS.map((p, i) => (
              <span key={p.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--foreground)' : 'var(--subtle-foreground)' }}>
                <Icono nombre={p.icono} tamano={22} />{p.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="max-w-[320px] rounded-xl bg-black/35 px-3 py-1.5 text-center text-[12px] leading-relaxed text-white">{pie}</figcaption>
    </figure>
  );
}
