'use client';

// Primer paso de «Reservar una cita» (pestaña «Citas» de /reservar y widget
// «Citas»): la foto a un lado, los servicios como un grupo de opciones y un
// solo botón que avanza. Antes cada servicio era un botón que saltaba directo a
// los huecos; ahora se marca y se confirma, como en la referencia del fundador.
//
// Solo decide qué servicio se elige: lo que viene después (instructora, hueco,
// confirmación) sigue en citas-publica.tsx, sin tocar.
//
// Radios nativos (ocultos a la vista, no al lector de pantalla): las flechas,
// el foco y el anuncio «1 de 3, marcado» los da el navegador, no un teclado
// hecho a mano.

import { useId, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { ServicioCita } from '@/lib/types';
import { serif, sans, cq, radius } from '@/lib/reservar-publico-tokens';
import { IMAGENES_POR_DEFECTO, alFallarImagen } from '@/lib/imagenes-por-defecto';
import { metaServicioCita, monogramaServicio, servicioMarcado } from '@/lib/reservar/servicio-cita';

interface Props {
  servicios: ServicioCita[];
  /** El servicio con el que se vuelve de los huecos: se conserva marcado. */
  inicial: string | null;
  /**
   * La foto del estudio (o la de por defecto). Sin ella la lista va sola: en la
   * página suelta la portada ya enseña esa misma foto justo encima.
   */
  foto?: string | null;
  onContinuar: (servicioId: string) => void;
}

// Una columna hasta 560 px del propio bloque (móvil, o el iframe metido en una
// columna estrecha): la foto queda como banda corta arriba. Container query y
// no media query: dentro del widget lo que cuenta es el ancho del bloque.
//
// La opción marcada y el foco van en tinta, no en el color de marca: sobre una
// web oscura la marca de muchos estudios es oscura también, y la elección
// dejaba de verse. Es el mismo criterio de las píldoras de instructora del
// paso siguiente.
const CSS = `
.cita-selector__tarjeta { grid-template-columns: minmax(0, 1fr); }
.cita-selector__foto { min-height: 128px; }
@container (min-width: 560px) {
  .cita-selector__tarjeta--foto { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
  .cita-selector__foto { min-height: 320px; }
}
.cita-selector__opcion { border: 1.5px solid var(--portal-line); background: var(--portal-surface); }
.cita-selector__opcion[data-marcada="false"]:hover { border-color: color-mix(in srgb, var(--portal-ink) 35%, var(--portal-line)); }
.cita-selector__opcion[data-marcada="true"] {
  border-color: var(--portal-ink);
  background: color-mix(in srgb, var(--portal-ink) 4%, var(--portal-surface));
}
.cita-selector__opcion:has(input:focus-visible),
.cita-selector__boton:focus-visible { outline: 2px solid var(--portal-ink); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  .cita-selector__opcion { transition: border-color .2s ease, background-color .2s ease; }
  .cita-selector__boton svg { transition: transform .25s ease; }
  .cita-selector__boton:hover svg { transform: translateX(3px); }
}
`;

export function SelectorCita({ servicios, inicial, foto, onContinuar }: Props) {
  const id = useId();
  const [elegido, setElegido] = useState<string | null>(inicial);
  const marcado = servicioMarcado(servicios, elegido);

  return (
    <section aria-labelledby={`${id}-t`} style={{ containerType: 'inline-size' }}>
      <style>{CSS}</style>
      <div
        className={`cita-selector__tarjeta${foto ? ' cita-selector__tarjeta--foto' : ''}`}
        style={{
          display: 'grid', overflow: 'hidden', borderRadius: radius.hero,
          background: 'var(--portal-surface)', border: '1px solid var(--portal-line)',
        }}
      >
        {foto && (
          <div className="cita-selector__foto" style={{ position: 'relative', background: 'var(--portal-surface-2)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto subida por el estudio o de public/por-defecto/, mismo criterio que la portada */}
            <img
              src={foto}
              alt=""
              decoding="async"
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', padding: cq(18, 4, 28), minWidth: 0 }}>
          <h2 id={`${id}-t`} style={{ fontFamily: serif, fontSize: cq(22, 3.6, 26), lineHeight: 1.15, fontWeight: 700, color: 'var(--portal-ink)', margin: 0 }}>
            Selecciona tu cita
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--portal-muted)', marginTop: 6 }}>
            Sesiones individuales con el equipo.
          </p>

          <div role="radiogroup" aria-labelledby={`${id}-t`} style={{ display: 'grid', gap: 8, marginTop: 16, marginBottom: 20 }}>
            {servicios.map(s => {
              const sel = s.id === marcado;
              // Sin color propio, el acento del widget: cambia con el modo, y la
              // marca oscura sobre fondo oscuro dejaba las iniciales sin leer.
              const color = s.color || 'var(--portal-accent)';
              return (
                <label
                  key={s.id}
                  className="cita-selector__opcion"
                  data-marcada={sel}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', minHeight: 64, borderRadius: 16, cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name={`${id}-servicio`}
                    value={s.id}
                    checked={sel}
                    onChange={() => setElegido(s.id)}
                    aria-labelledby={`${id}-${s.id}-n ${id}-${s.id}-m`}
                    aria-describedby={s.descripcion ? `${id}-${s.id}-d` : undefined}
                    className="sr-only"
                  />
                  <span aria-hidden="true" style={{
                    width: 44, height: 44, flex: '0 0 auto', borderRadius: 12, display: 'grid', placeItems: 'center',
                    background: `color-mix(in srgb, ${color} 16%, var(--portal-surface))`,
                    color: `color-mix(in srgb, ${color} 65%, var(--portal-ink))`,
                    fontFamily: serif, fontSize: 15, fontWeight: 700, letterSpacing: '.02em',
                  }}>
                    {monogramaServicio(s.nombre)}
                  </span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span id={`${id}-${s.id}-n`} style={{ display: 'block', fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: 'var(--portal-ink)' }}>
                      {s.nombre}
                    </span>
                    <span id={`${id}-${s.id}-m`} style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {metaServicioCita(s)}
                    </span>
                    {s.descripcion && (
                      <span id={`${id}-${s.id}-d`} style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, color: 'var(--portal-muted)', marginTop: 4 }}>
                        {s.descripcion}
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" style={{
                    width: 22, height: 22, flex: '0 0 auto', borderRadius: 999, display: 'grid', placeItems: 'center',
                    background: sel ? 'var(--portal-ink)' : 'transparent',
                    color: 'var(--portal-surface)',
                    border: sel ? '1.5px solid var(--portal-ink)' : '1.5px solid color-mix(in srgb, var(--portal-muted) 60%, transparent)',
                  }}>
                    {sel && <Check size={13} strokeWidth={3} />}
                  </span>
                </label>
              );
            })}
          </div>

          <button
            type="button"
            className="cita-selector__boton"
            onClick={() => { if (marcado) onContinuar(marcado); }}
            style={{
              marginTop: 'auto', width: '100%', minHeight: 50, padding: '0 22px', borderRadius: radius.pill, border: 0,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              fontFamily: sans, fontSize: 15, fontWeight: 700, letterSpacing: '.01em', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Reservar cita
            <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
