'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaDia, horaFin } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso } from '@/lib/student/estado-clase';
// ⚠️ Los enlaces del paquete son absolutos ('/reservar/…') porque allí la app
// es la única del proyecto. Aquí cuelgan del slug del estudio, así que pasan
// por `usePortalHref()`: dejarlos absolutos mandaría a la alumna a la landing
// de Tentare o al panel.
/** Card "Tu próxima clase" del kit: foto + overlay verde noche, texto claro, acciones. */
export function NextClassCard({ reserva, clase, instructora, onCalendario, onComoLlegar }: { reserva: Reserva; clase: Clase; instructora?: Instructora; onCalendario?: () => void; onComoLlegar?: () => void }) {
  const href = usePortalHref();
  // Si la clase se está dando, esta tarjeta deja de ser «tu PRÓXIMA clase» y
  // pasa a ser «tu clase de AHORA». No es un adorno: llamar «próxima» a algo que
  // ya ha empezado le dice a la alumna que aún le queda tiempo.
  const ahoraMs = useAhoraMs();
  const enCurso = estaEnCurso(clase, ahoraMs);
  return (
    <section aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'} className="a-pop" style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--accent-deep-foreground)' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'url(' + clase.fotoUrl + ') center/cover' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))' }} />
      <div style={{ position: 'relative', padding: '14px 15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* El punto ya latía aquí de adorno. En curso se enciende de verdad:
              mismo elemento, ahora significa algo. */}
          <p className="t-label" style={{ color: enCurso ? '#FAF9F5' : 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }} role={enCurso ? 'status' : undefined}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: enCurso ? '#FAF9F5' : 'var(--accent-deep-muted)', animation: enCurso ? 'apPulse 1.6s infinite' : 'apPulse 2s infinite' }} />{enCurso ? 'Tu clase, en curso' : 'Tu próxima clase'}</p>
          {/* En curso el día sobra —es hoy— y lo que importa es cuánto queda. */}
          <span className="t-num" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--accent-deep-muted)' }}>{enCurso ? 'hasta las ' + horaFin(clase.hora, clase.duracionMin) : etiquetaDia(clase.fecha).toLowerCase() + ' · ' + clase.hora}</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--t-h3)', fontWeight: 800, letterSpacing: '-.02em', color: '#FAF9F5' }}>{clase.nombre}</p>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)' }}>con {instructora?.nombre} · {clase.sala} · {clase.duracionMin} min</p>
        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
          <Link href={href('/mis-reservas/' + reserva.id)} className="btn btn--sm tap" style={{ background: '#FAF9F5', color: 'var(--accent-deep)', height: 34 }}>Ver mi reserva</Link>
          <button type="button" onClick={onComoLlegar} className="btn btn--sm tap" style={{ height: 34, background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)', color: 'var(--accent-deep-foreground)', border: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 35%, transparent)' }}>Cómo llegar</button>
          <button type="button" onClick={onCalendario} className="btn btn--sm tap" style={{ height: 34, background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)', color: 'var(--accent-deep-foreground)', border: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 35%, transparent)' }}>+ Calendario</button>
        </div>
      </div>
    </section>
  );
}
