'use client';

// «Nuestro equipo» en /reservar («El estudio») y en el widget «Instructoras»
// (`tab=equipo`): un carrusel con una tarjeta por persona que da clase.
//
// Solo lo que existe: foto (o sus iniciales en su color), nombre y los tipos
// de clase que tiene en el horario (lib/reservar/equipo-publico.ts). Sin
// valoraciones ni bio: la tarjeta es para poner cara a un nombre del horario,
// no para leerla. Las flechas solo salen si hay más gente de la que cabe; en
// el móvil se desliza con el dedo, y con el teclado, con las flechas.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Instructor } from '@/lib/types';
import { queImparten } from '@/lib/equipo';
import { iniciales } from '@/lib/mensajeria/presentacion';
import { colorSeguro, destinoCarrusel, tiposQueImparte, type TipoQueImparte, type Tramo } from '@/lib/reservar/equipo-publico';
import { serif } from '@/lib/reservar-publico-tokens';

interface Props {
  /** El staff tal cual: aquí se queda solo quien imparte (`queImparten`). */
  instructores: Instructor[];
  sesiones: { instructorId?: string | null; tipoClaseId: string }[];
  tiposClase: { id: string; nombre: string; color?: string | null }[];
  /** El titular de cada sitio: el h2 del widget o el rótulo de «El estudio». */
  cabecera: ReactNode;
  /** Nombre accesible del carrusel. */
  etiqueta: string;
}

const marca = 'var(--portal-brand)';
const FOTO = 104;
const HUECO = 14;

// Cuatro por fila en escritorio y dos y un trozo de la siguiente en el móvil,
// que es lo que invita a deslizar. `cqw` mide el propio carrusel (container
// abajo): el widget incrustado en una columna estrecha se comporta como móvil.
const anchoTarjeta = `clamp(152px, calc((100cqw - ${3 * HUECO}px) / 4), 250px)`;

const css = `
.equipo-publico-carril { scrollbar-width: none; }
.equipo-publico-carril::-webkit-scrollbar { display: none; }
.equipo-publico-carril:focus-visible,
.equipo-publico-flecha:focus-visible { outline: 2px solid var(--portal-brand); outline-offset: 3px; }
.equipo-publico-flecha:not([aria-disabled='true']):hover { background: var(--portal-surface-2); }
`;

function Retrato({ i }: { i: Instructor }) {
  const [fallo, setFallo] = useState(false);
  if (i.fotoUrl && !fallo) {
    return (
      // alt vacío: el nombre va justo debajo, leerlo dos veces no ayuda.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={i.fotoUrl} alt="" width={FOTO} height={FOTO} loading="lazy" decoding="async"
        onError={() => setFallo(true)}
        style={{ display: 'block', width: FOTO, height: FOTO, borderRadius: 999, objectFit: 'cover', background: 'var(--portal-surface-2)', flex: '0 0 auto' }}
      />
    );
  }
  const color = colorSeguro(i.color) ?? marca;
  return (
    <span aria-hidden="true" style={{
      width: FOTO, height: FOTO, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center',
      background: `color-mix(in srgb, ${color} 16%, var(--portal-surface))`,
      boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${color} 45%, transparent)`,
      fontFamily: serif, fontSize: 32, fontWeight: 700, letterSpacing: '.02em', color: 'var(--portal-ink)',
    }}>
      {iniciales(i.nombre)}
    </span>
  );
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 26, padding: '3px 10px', borderRadius: 999,
  fontSize: 12, fontWeight: 600, lineHeight: 1.2, color: 'var(--portal-ink)',
};

function Chip({ t }: { t: TipoQueImparte }) {
  const color = t.color ?? marca;
  return (
    <li style={{ ...chip, background: `color-mix(in srgb, ${color} 12%, var(--portal-surface))` }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: color, flex: '0 0 auto' }} />
      {t.nombre}
    </li>
  );
}

// Tres como mucho: todas las tarjetas del carrusel miden lo que la más alta, y
// una con cinco tipos estiraba a las demás con un hueco en blanco. El resto se
// resume en «+N», y un lector de pantalla los oye todos.
const MAX_CHIPS = 3;

function Chips({ tipos }: { tipos: TipoQueImparte[] }) {
  const cortar = tipos.length > MAX_CHIPS;
  const vistos = cortar ? tipos.slice(0, MAX_CHIPS - 1) : tipos;
  const resto = tipos.slice(vistos.length);
  return (
    <ul aria-label="Clases que imparte" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12, listStyle: 'none', padding: 0 }}>
      {vistos.map(t => <Chip key={t.id} t={t} />)}
      {cortar && (
        <li title={resto.map(t => t.nombre).join(', ')} style={{ ...chip, position: 'relative', background: 'var(--portal-surface-2)', color: 'var(--portal-muted)' }}>
          <span aria-hidden="true">+{resto.length}</span>
          <span className="sr-only">{resto.map(t => t.nombre).join(', ')}</span>
        </li>
      )}
    </ul>
  );
}

const flecha: CSSProperties = {
  width: 44, height: 44, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center',
  border: '1px solid var(--portal-line)', background: 'var(--portal-surface)', color: 'var(--portal-ink)',
  cursor: 'pointer', transition: 'background .15s ease, opacity .15s ease',
};

export function EquipoPublico({ instructores, sesiones, tiposClase, cabecera, etiqueta }: Props) {
  const equipo = queImparten(instructores);
  const tiposPorPersona = tiposQueImparte(sesiones, tiposClase);
  const idLista = useId();
  const carrilRef = useRef<HTMLDivElement>(null);
  const [bordes, setBordes] = useState({ antes: false, despues: false });
  const hayMas = bordes.antes || bordes.despues;

  // Las flechas dependen de si sobra gente, y eso solo se sabe midiendo: cambia
  // con el ancho (girar el móvil, la columna donde se incrusta) y al deslizar.
  useEffect(() => {
    const el = carrilRef.current;
    if (!el) return;
    const medir = () => {
      const antes = el.scrollLeft > 1;
      const despues = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setBordes(b => (b.antes === antes && b.despues === despues ? b : { antes, despues }));
    };
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    el.addEventListener('scroll', medir, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', medir);
    };
  }, [equipo.length]);

  function desplazar(dir: 1 | -1) {
    const el = carrilRef.current;
    if (!el) return;
    const base = el.getBoundingClientRect().left - el.scrollLeft;
    const tarjetas: Tramo[] = [...el.querySelectorAll<HTMLElement>('[data-tarjeta-equipo]')].map(n => {
      const r = n.getBoundingClientRect();
      return { inicio: r.left - base, fin: r.right - base };
    });
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: destinoCarrusel(tarjetas, el.scrollLeft, el.clientWidth, dir), behavior: quieto ? 'auto' : 'smooth' });
  }

  if (equipo.length === 0) {
    return (
      <div>
        {cabecera}
        <p role="status" style={{ fontSize: 14, color: 'var(--portal-muted)', marginTop: 14 }}>
          Pronto conocerás a nuestro equipo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <style>{css}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <div style={{ minWidth: 0 }}>{cabecera}</div>
        {hayMas && (
          <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
            {/* aria-disabled y no `disabled`: al llegar al borde el foco se
                queda en el botón en vez de saltar al principio de la página. */}
            <button
              type="button" className="equipo-publico-flecha" aria-label="Ver instructoras anteriores" aria-controls={idLista}
              aria-disabled={!bordes.antes} onClick={() => bordes.antes && desplazar(-1)}
              style={{ ...flecha, opacity: bordes.antes ? 1 : 0.4, cursor: bordes.antes ? 'pointer' : 'default' }}
            >
              <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button" className="equipo-publico-flecha" aria-label="Ver más instructoras" aria-controls={idLista}
              aria-disabled={!bordes.despues} onClick={() => bordes.despues && desplazar(1)}
              style={{ ...flecha, opacity: bordes.despues ? 1 : 0.4, cursor: bordes.despues ? 'pointer' : 'default' }}
            >
              <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={carrilRef} id={idLista} role="region" aria-label={etiqueta}
        // Enfocable solo si hay algo que desplazar: así el teclado lo mueve con
        // las flechas, y si todo cabe no es una parada de tabulador vacía.
        tabIndex={hayMas ? 0 : undefined}
        className="equipo-publico-carril"
        style={{
          containerType: 'inline-size', marginTop: 18, overflowX: 'auto', overscrollBehaviorX: 'contain',
          scrollSnapType: 'x mandatory', borderRadius: 20,
        }}
      >
        <ul style={{ display: 'flex', gap: HUECO, width: 'max-content', listStyle: 'none', margin: 0, padding: 0 }}>
          {equipo.map(i => {
            const tipos = tiposPorPersona.get(i.id) ?? [];
            return (
              <li
                key={i.id} data-tarjeta-equipo=""
                style={{
                  width: anchoTarjeta, flex: '0 0 auto', scrollSnapAlign: 'start',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                  padding: '22px 14px 18px', borderRadius: 20,
                  background: 'var(--portal-surface)', border: '1px solid var(--portal-line)',
                }}
              >
                <Retrato i={i} />
                <h3 style={{ fontFamily: serif, fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, color: 'var(--portal-ink)', marginTop: 14, overflowWrap: 'anywhere' }}>
                  {i.nombre}
                </h3>
                {tipos.length > 0 && <Chips tipos={tipos} />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
