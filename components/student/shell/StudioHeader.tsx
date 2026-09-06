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
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: transparente ? 'rgba(250,249,245,.22)' : 'var(--accent)', color: transparente ? '#FAF9F5' : 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>
              {inicialDe(estudio.nombre)}
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estudio.nombre}</span>
        </Link>

        <Link
          href={href('/notificaciones')}
          aria-label={'Notificaciones' + (noLeidas ? `, ${noLeidas} sin leer` : '')}
          className="tap tap--icono"
          style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + (transparente ? 'rgba(255,255,255,.45)' : 'var(--border)'), background: transparente ? 'rgba(250,249,245,.22)' : 'var(--card)', color: transparente ? '#FAF9F5' : 'var(--foreground)' }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10 21a2 2 0 0 0 4 0" />
          </svg>
          {noLeidas > 0 && (
            <span aria-hidden style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 99, background: 'var(--warning)', border: '1.5px solid #fff', animation: 'apDot .4s both' }} />
          )}
        </Link>
      </div>
    </header>
  );
}
