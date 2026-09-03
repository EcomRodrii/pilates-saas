'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaDia } from '@/lib/student/formato';
// ⚠️ Los enlaces del paquete son absolutos ('/reservar/…') porque allí la app
// es la única del proyecto. Aquí cuelgan del slug del estudio, así que pasan
// por `usePortalHref()`: dejarlos absolutos mandaría a la alumna a la landing
// de Tentare o al panel.
/** Card "Tu próxima clase" del kit: foto + overlay verde noche, texto claro, acciones. */
export function NextClassCard({ reserva, clase, instructora, onCalendario, onComoLlegar }: { reserva: Reserva; clase: Clase; instructora?: Instructora; onCalendario?: () => void; onComoLlegar?: () => void }) {
  const href = usePortalHref();
  return (
    <section aria-label="Tu próxima clase" className="a-pop" style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--accent-deep-foreground)' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'url(' + clase.fotoUrl + ') center/cover' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))' }} />
      <div style={{ position: 'relative', padding: '14px 15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="t-label" style={{ color: 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: '#7BC488', animation: 'apPulse 2s infinite' }} />Tu próxima clase</p>
          <span className="t-mono" style={{ fontSize: 10.5, color: 'var(--accent-deep-muted)' }}>{etiquetaDia(clase.fecha).toLowerCase()} · {clase.hora}</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', color: '#FAF9F5' }}>{clase.nombre}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(234,240,231,.8)' }}>con {instructora?.nombre} · {clase.sala} · {clase.duracionMin} min</p>
        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
          <Link href={href('/mis-reservas/' + reserva.id)} className="btn btn--sm" style={{ background: '#FAF9F5', color: 'var(--accent-deep)', height: 34 }}>Ver mi reserva</Link>
          <button type="button" onClick={onComoLlegar} className="btn btn--sm" style={{ height: 34, background: 'rgba(234,240,231,.12)', color: '#EAF0E7', border: '1px solid rgba(234,240,231,.35)' }}>Cómo llegar</button>
          <button type="button" onClick={onCalendario} className="btn btn--sm" style={{ height: 34, background: 'rgba(234,240,231,.12)', color: '#EAF0E7', border: '1px solid rgba(234,240,231,.35)' }}>+ Calendario</button>
        </div>
      </div>
    </section>
  );
}
