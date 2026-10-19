'use client';
import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaDia, horaFin } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso } from '@/lib/student/estado-clase';
import { Icono } from '@/components/student/ui/Icono';
// ⚠️ Los enlaces del paquete son absolutos ('/reservar/…') porque allí la app
// es la única del proyecto. Aquí cuelgan del slug del estudio, así que pasan
// por `usePortalHref()`: dejarlos absolutos mandaría a la alumna a la landing
// de Tentare o al panel.
/**
 * «Tu próxima clase» cuando no es ni hoy ni mañana (con clase hoy o mañana va `ClaseDelMomentoCard`, arriba). Misma
 * piel que esa: la foto de la clase a sangre con su velo negro (`.velo-foto`), la píldora con el día y la hora grande
 * (maqueta de oct-2026). Sin foto, el fondo es el color hondo del estudio.
 */
export function NextClassCard({ reserva, clase, instructora, onCalendario, onComoLlegar }: { reserva: Reserva; clase: Clase; instructora?: Instructora; onCalendario?: () => void; onComoLlegar?: () => void }) {
  const href = usePortalHref();
  const ahoraMs = useAhoraMs();
  const enCurso = estaEnCurso(clase, ahoraMs);
  const hrefReserva = href('/mis-reservas/' + reserva.id);
  const enlaceFila = { background: 'none', border: 'none', padding: '6px 0', color: 'var(--on-dark)', font: 'inherit', fontWeight: 700 } as const;
  return (
    <section aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'} className="a-pop" style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--on-dark)', background: 'var(--accent-deep)' }}>
      {clase.fotoUrl && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'url(' + clase.fotoUrl + ') center 35%/cover' }} />}
      <div aria-hidden className="velo-foto" />
      <div style={{ position: 'relative', padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', minHeight: 220 }}>
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, color: 'inherit', flex: 1 }}>
          {/* En curso el día sobra —es hoy— y lo que importa es cuánto queda. */}
          <span className="pildora-foto t-label" role={enCurso ? 'status' : undefined}>
            {enCurso && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: 'currentColor', animation: 'apPulse 1.6s infinite' }} />}
            {enCurso ? 'Tu clase, en curso · hasta las ' + horaFin(clase.hora, clase.duracionMin) : 'Tu próxima clase · ' + etiquetaDia(clase.fecha).toLowerCase()}
          </span>
          <span style={{ flex: 1 }} />
          <span className="t-num" style={{ fontSize: 46, fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.04em', lineHeight: 1 }}>{clase.hora}</span>
          <span style={{ fontSize: 'calc(var(--t-h1) * var(--heading-scale) * .86)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.025em', lineHeight: 1.1 }}>{clase.nombre}</span>
          <span className="fila-meta-foto">
            <span><Icono nombre="reloj" tamano={15} />{clase.duracionMin} min</span>
            {clase.sala && <span><Icono nombre="ubicacion" tamano={15} />{clase.sala}</span>}
            {instructora?.nombre && <span><Icono nombre="instructoras" tamano={15} />{instructora.nombre}</span>}
          </span>
        </Link>
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap boton-foto">
          <span>Ver mi reserva</span>
          <span aria-hidden className="boton-foto-flecha"><Icono nombre="flecha-derecha" tamano={18} /></span>
        </Link>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s-5)', fontSize: 'var(--t-meta)' }}>
          <button type="button" onClick={onComoLlegar} className="tap" style={enlaceFila}>Cómo llegar</button>
          <button type="button" onClick={onCalendario} className="tap" style={enlaceFila}>+ Calendario</button>
        </div>
      </div>
    </section>
  );
}
