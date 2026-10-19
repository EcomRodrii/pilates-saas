'use client';

import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaMomento, type CuandoClase } from '@/lib/student/momento-inicio';
import { Icono } from '@/components/student/ui/Icono';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

// «Tu clase de hoy / de mañana», lo PRIMERO de Inicio cuando la hay
// (maqueta aprobada, oct-2026). Es la misma reserva que «Tu próxima clase»
// (`claseDelMomento` usa su mismo filtro), así que esa tarjeta no se repite
// debajo: sube aquí con lo que se necesita al llegar al estudio.
//
// La acción grande es la de ese momento: el QR para entrar (si el estudio usa el acceso con QR; si no, «Ver mi
// reserva»). «Cómo llegar» y «+ Calendario» van en la fila de abajo, como texto: siguen a un toque sin competir con
// ella (maqueta de oct-2026, un solo botón ancho).
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
  // Maqueta de oct-2026 (cuatro iPhones): la FOTO de la clase a sangre y el texto sobre su sombra, no un velo de marca
  // que la tapa entera. El velo sube desde abajo y a la izquierda, que es donde vive el texto, y no depende del color
  // del estudio: sobre una foto, el que contrasta es el negro (ver la nota del héroe de Inicio).
  // Sin foto, el fondo es el color hondo del estudio y el texto se lee igual.
  const primaria = conQr
    ? { href: href('/perfil/qr'), texto: 'Mi QR para entrar' }
    : { href: hrefReserva, texto: 'Ver mi reserva' };
  const enlaceFila = { background: 'none', border: 'none', padding: '6px 0', color: 'var(--on-dark)', font: 'inherit', fontWeight: 700 } as const;
  return (
    <section
      aria-label={cuando === 'ahora' ? 'Tu clase de ahora' : cuando === 'hoy' ? 'Tu clase de hoy' : 'Tu clase de mañana'}
      data-testid="clase-del-momento"
      className="a-pop tarjeta-foto"
      style={{ position: 'relative', borderRadius: 'var(--radius-sheet)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', color: 'var(--on-dark)', background: 'var(--accent-deep)' }}
    >
      {clase.fotoUrl && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'url(' + clase.fotoUrl + ') center 35%/cover' }} />}
      <div aria-hidden className="velo-foto" />
      <div style={{ position: 'relative', padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', minHeight: 236 }}>
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, color: 'inherit', flex: 1 }}>
          {/* `suppressHydrationWarning`: la cuenta atrás depende del reloj. */}
          <span className="pildora-foto t-label" suppressHydrationWarning role={cuando === 'ahora' ? 'status' : undefined}>
            {cuando === 'ahora' && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: 'currentColor', animation: 'apPulse 1.6s infinite' }} />}
            {cuando === 'ahora'
              // En dos piezas: «Tu clase, en curso» es el mismo rótulo que en el resto de la app.
              ? (() => { const [rotulo, ...resto] = etiquetaMomento({ clase, cuando }, ahoraMs).split(' · '); return <><span>{rotulo}</span><span>· {resto.join(' · ')}</span></>; })()
              : etiquetaMomento({ clase, cuando }, ahoraMs)}
          </span>
          <span style={{ flex: 1 }} />
          <span className="t-num" style={{ fontSize: 46, fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.04em', lineHeight: 1 }}>
            {clase.hora}
          </span>
          <span style={{ fontSize: 'calc(var(--t-h1) * var(--heading-scale) * .86)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.025em', lineHeight: 1.1 }}>
            {clase.nombre}
          </span>
          <span className="fila-meta-foto">
            <span><Icono nombre="reloj" tamano={15} />{clase.duracionMin} min</span>
            {clase.sala && <span><Icono nombre="ubicacion" tamano={15} />{clase.sala}</span>}
            {instructora?.nombre && <span><Icono nombre="instructoras" tamano={15} />{instructora.nombre}</span>}
          </span>
        </Link>
        <Link href={primaria.href} transitionTypes={TRANSICION_ADELANTE} className="tap boton-foto">
          <span>{primaria.texto}</span>
          <span aria-hidden className="boton-foto-flecha"><Icono nombre="flecha-derecha" tamano={18} /></span>
        </Link>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s-5)', fontSize: 'var(--t-meta)' }}>
          {conQr && (
            <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap" style={enlaceFila}>
              Ver mi reserva
            </Link>
          )}
          <button type="button" onClick={onComoLlegar} className="tap" style={enlaceFila}>
            Cómo llegar
          </button>
          <button type="button" onClick={onCalendario} className="tap" style={enlaceFila}>
            + Calendario
          </button>
        </div>
      </div>
    </section>
  );
}
