'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Notificacion } from '@/lib/student/tipos';
import { iconoDeAviso } from '@/lib/student/avisos-vista';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// Un aviso de «Avisos» (rediseño del 5-oct-2026): su icono por tipo de evento,
// título, texto y hora; y debajo, si el aviso pide algo, su botón (`children`).
//
// Sin leer = un punto del color de acento y el título más fuerte. Ya no hay fondo
// gris/acento en la fila: con todo el bloque teñido, la lista entera se leía como
// «pendiente» y el punto dejaba de decir nada.
//
// ⚠️ El punto es `--accent` y no `--success`: `--success` es el de «Reservada ✓»,
// y dos estados distintos con el mismo color se leen como el mismo estado.
export function NotificationItem({ n, hora, primera = false, children }: {
  n: Notificacion; hora: string; primera?: boolean; children?: ReactNode;
}) {
  const icono = iconoDeAviso(n.evento, n.tipo) as NombreIcono;
  const texto = (
    <>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-body)', fontWeight: n.leida ? 700 : 800, lineHeight: 1.3, color: 'var(--foreground)' }}>{n.titulo}</span>
        {/* `--muted-foreground`: el token sutil no llega a AA sobre la tarjeta en las marcas oscuras. */}
        <span className="t-num" style={{ flexShrink: 0, fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--muted-foreground)' }}>{hora}</span>
        {!n.leida && <span aria-label="Sin leer" role="img" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 99, background: 'var(--accent)', alignSelf: 'center' }} />}
      </span>
      <span className="t-meta" style={{ display: 'block', marginTop: 3, lineHeight: 1.45, fontSize: 'var(--t-small)' }}>{n.cuerpo}</span>
    </>
  );
  return (
    <div data-testid="aviso" data-evento={n.evento ?? undefined} data-leida={n.leida ? '1' : '0'} style={{ display: 'flex', gap: 12, padding: '13px 0', borderTop: primera ? 'none' : '1px solid var(--border)' }}>
      <span
        aria-hidden
        style={{
          width: 40, height: 40, flexShrink: 0, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: n.leida ? 'var(--muted)' : 'var(--accent-soft)',
          color: n.leida ? 'var(--muted-foreground)' : 'var(--accent-soft-foreground)',
        }}
      >
        <Icono nombre={icono} tamano={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {n.enlace
          ? <Link href={n.enlace} className="card--tap" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>{texto}</Link>
          : <div>{texto}</div>}
        {children}
      </div>
    </div>
  );
}
