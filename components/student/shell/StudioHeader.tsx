'use client';

import Link from 'next/link';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { inicialDe } from '@/lib/monograma-estudio';

/**
 * Cabecera fija con la marca del estudio. Del paquete
 * (`components/shell/StudioHeader.tsx`), con dos diferencias obligadas:
 *
 *  1. El estudio sale del contexto (depende del slug), no de una constante.
 *  2. Los `href` se construyen con el prefijo `/portal/<slug>`.
 *
 * `transparente` es para los héroes fotográficos (Inicio, detalle de clase),
 * donde el header flota sobre la foto — decisión visual del handoff §12.
 */
export function StudioHeader({ noLeidas = 0, transparente = false }: { noLeidas?: number; transparente?: boolean }) {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 46, paddingTop: 'var(--safe-top)',
        background: transparente ? 'transparent' : 'rgba(250,249,245,.88)',
        backdropFilter: transparente ? undefined : 'blur(16px)',
        borderBottom: transparente ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
        {/* ⚠️ `minWidth: 0` y el recorte de abajo NO están en el paquete, y sin
            ellos el header se rompe con datos reales.
            Medido a 320px con un logo apaisado (2000×200, un lockup de marca de
            lo más normal) y el nombre completo del estudio: el logo crecía a
            260px porque `height: 26` no lleva tope de anchura, el nombre se
            iba hasta x=349 —en una pantalla de 320— y SE SOLAPABA con la
            campana, que empieza en 281. El paquete no lo ve porque su mock
            tiene `logoUrl: null` y un nombre corto.
            No se tapa con `overflow: hidden` en el header: se arregla donde
            está el problema — el logo se acota, el nombre puede encogerse y
            elidirse, y la campana no se comprime nunca. */}
        <Link href={href()} aria-label={estudio.nombre} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, color: transparente ? '#FAF9F5' : 'var(--foreground)' }}>
          {estudio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estudio.logoUrl} alt="" style={{ height: 26, maxWidth: 132, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            // Sin logo, monograma con la inicial — el diseño lo declara como
            // estado normal, no como respaldo de error (`logoUrl: null`).
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: transparente ? 'rgba(250,249,245,.22)' : 'var(--accent)', color: transparente ? '#FAF9F5' : 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-meta)', fontWeight: 800 }}>
              {inicialDe(estudio.nombre)}
            </span>
          )}
          <span style={{ fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estudio.nombre}</span>
        </Link>

        <Link
          href={href('/notificaciones')}
          aria-label={'Notificaciones' + (noLeidas ? `, ${noLeidas} sin leer` : '')}
          className="tap tap--icono"
          style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + (transparente ? 'rgba(255,255,255,.45)' : 'var(--border)'), background: transparente ? 'rgba(250,249,245,.22)' : 'var(--card)', color: transparente ? '#FAF9F5' : 'var(--foreground)' }}
        >
          {/* La campana del mismo set que la barra de abajo (HugeIcons
              stroke-rounded), a 1.5 por el mismo motivo: a 2 se empasta el
              badajo con la falda. */}
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 18C16 20.2091 14.2091 22 12 22C9.79086 22 8 20.2091 8 18" />
            <path d="M4.43654 18H19.5625C20.2903 18 20.6542 18 20.8648 17.8951C21.274 17.6913 21.4929 17.2359 21.3964 16.789C21.3468 16.559 21.1194 16.2749 20.6648 15.7066L20.4951 15.4944C20.0392 14.9246 19.8113 14.6397 19.6184 14.3409C19.0187 13.4119 18.6477 12.354 18.5356 11.254C18.4995 10.9002 18.4995 10.5353 18.4995 9.8056V8.5C18.4995 8.03572 18.4995 7.80358 18.4867 7.60758C18.2898 4.60304 15.8965 2.20977 12.892 2.01285C12.696 2 12.4638 2 11.9995 2C11.5353 2 11.3031 2 11.1071 2.01285C8.10258 2.20977 5.70931 4.60304 5.51239 7.60758C5.49954 7.80358 5.49954 8.03572 5.49954 8.5V9.8056C5.49954 10.5353 5.49954 10.9002 5.46349 11.254C5.35143 12.354 4.98035 13.4119 4.38067 14.3409C4.18779 14.6397 3.95985 14.9246 3.50401 15.4944L3.33427 15.7066C2.87964 16.2749 2.65233 16.559 2.60268 16.789C2.50621 17.2359 2.72509 17.6913 3.13431 17.8951C3.3449 18 3.70878 18 4.43654 18Z" />
          </svg>
          {noLeidas > 0 && (
            <span aria-hidden style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 99, background: 'var(--warning)', border: '1.5px solid #fff', animation: 'apDot .4s both' }} />
          )}
        </Link>
      </div>
    </header>
  );
}
