'use client';

import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaMomento, type CuandoClase } from '@/lib/student/momento-inicio';
import { unir } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

// «Tu clase de hoy / de mañana», lo PRIMERO de Inicio cuando la hay
// (maqueta aprobada, oct-2026). Es la misma reserva que «Tu próxima clase»
// (`claseDelMomento` usa su mismo filtro), así que esa tarjeta no se repite
// debajo: sube aquí con lo que se necesita al llegar al estudio.
//
// Las dos acciones grandes son las de ese momento: el QR para entrar (si el
// estudio usa el acceso con QR; si no, «Ver mi reserva») y «Cómo llegar».
// Lo que traía la tarjeta de antes —ver la reserva y añadirla al calendario—
// se queda en la fila de abajo: subirla no le quita nada.
//
// ⚠️ La maqueta escribe «Plaza 4»: la reserva NO trae número de plaza en el
// payload de la alumna (`Reserva` no tiene ese dato), así que no se pinta.
export function ClaseDelMomentoCard({
  reserva, clase, cuando, instructora, conQr, onComoLlegar, onCalendario,
}: {
  reserva: Reserva;
  clase: Clase;
  cuando: CuandoClase;
  instructora?: Instructora;
  /** El estudio usa el acceso con QR (`estudio.qrAcceso`). */
  conQr: boolean;
  onComoLlegar: () => void;
  onCalendario: () => void;
}) {
  const href = usePortalHref();
  const ahoraMs = useAhoraMs();
  const hrefReserva = href('/mis-reservas/' + reserva.id);
  const botonClaro = {
    background: 'var(--on-dark)', color: 'var(--accent-deep)', border: 'none',
  } as const;
  const botonContorno = {
    background: 'color-mix(in srgb, var(--accent-deep-foreground) 10%, transparent)',
    color: 'var(--accent-deep-foreground)',
    border: '1.5px solid color-mix(in srgb, var(--accent-deep-foreground) 40%, transparent)',
  } as const;
  return (
    <section
      aria-label={cuando === 'ahora' ? 'Tu clase de ahora' : cuando === 'hoy' ? 'Tu clase de hoy' : 'Tu clase de mañana'}
      data-testid="clase-del-momento"
      className="a-pop"
      style={{ position: 'relative', borderRadius: 'var(--radius-sheet)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--accent-deep-foreground)' }}
    >
      {clase.fotoUrl && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'url(' + clase.fotoUrl + ') center/cover' }} />}
      {/* El color del estudio, no un verde fijo: mismo velo que «Tu próxima clase». */}
      <div aria-hidden className="velo-marca" style={{ ['--velo-desde' as string]: '96%', ['--velo-hasta' as string]: '82%' }} />
      <div style={{ position: 'relative', padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap" style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'inherit' }}>
          {/* `suppressHydrationWarning`: la cuenta atrás depende del reloj. */}
          <span className="t-label" suppressHydrationWarning style={{ color: 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }} role={cuando === 'ahora' ? 'status' : undefined}>
            {cuando === 'ahora' && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--on-dark)', animation: 'apPulse 1.6s infinite' }} />}
            {cuando === 'ahora'
              // En dos piezas: «Tu clase, en curso» es el mismo rótulo que en el resto de la app.
              ? (() => { const [rotulo, ...resto] = etiquetaMomento({ clase, cuando }, ahoraMs).split(' · '); return <><span>{rotulo}</span><span>· {resto.join(' · ')}</span></>; })()
              : etiquetaMomento({ clase, cuando }, ahoraMs)}
          </span>
          <span style={{ fontSize: 'calc(var(--t-h1) * var(--heading-scale))', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.08, color: 'var(--on-dark)' }}>
            <span className="t-num">{clase.hora}</span> · {clase.nombre}
          </span>
          <span style={{ fontSize: 'var(--t-small)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 88%, transparent)' }}>
            {unir(instructora?.nombre ? `Con ${instructora.nombre}` : null, clase.sala, `${clase.duracionMin} min`)}
          </span>
        </Link>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)' }}>
          {conQr ? (
            <Link href={href('/perfil/qr')} transitionTypes={TRANSICION_ADELANTE} className="btn tap" style={{ ...botonClaro, height: 'var(--h-control-md)', padding: '0 var(--s-2)' }}>
              Mi QR para entrar
            </Link>
          ) : (
            <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="btn tap" style={{ ...botonClaro, height: 'var(--h-control-md)', padding: '0 var(--s-2)' }}>
              Ver mi reserva
            </Link>
          )}
          <button type="button" onClick={onComoLlegar} className="btn tap" style={{ ...botonContorno, height: 'var(--h-control-md)', padding: '0 var(--s-2)' }}>
            Cómo llegar
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s-5)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
          {conQr && (
            <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap" style={{ color: 'var(--accent-deep-foreground)', padding: '4px 0' }}>
              Ver mi reserva
            </Link>
          )}
          <button type="button" onClick={onCalendario} className="tap" style={{ background: 'none', border: 'none', padding: '4px 0', color: 'var(--accent-deep-foreground)', font: 'inherit', fontWeight: 700 }}>
            + Calendario
          </button>
        </div>
      </div>
    </section>
  );
}
