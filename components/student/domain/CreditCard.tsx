'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Bono } from '@/lib/student/tipos';
import { fechaCorta } from '@/lib/student/formato';
import { Badge } from '@/components/student/ui/Badge';
// ⚠️ Los enlaces del paquete son absolutos ('/reservar/…') porque allí la app
// es la única del proyecto. Aquí cuelgan del slug del estudio, así que pasan
// por `usePortalHref()`: dejarlos absolutos mandaría a la alumna a la landing
// de Tentare o al panel.
/** Card de bono del kit: nombre, barra de progreso, "quedan N" en mono, caducidad. */
export function CreditCard({ bono, compacta = false }: { bono: Bono; compacta?: boolean }) {
  const href = usePortalHref();
  // Un plan ilimitado llega con `creditosTotales: Infinity` (el diseño no
  // tiene ese concepto). Restar daba «Infinity», dividir daba NaN, y la socia
  // veía «Infinity de Infinity sesiones» con la barra en `width: NaN%`.
  const ilimitado = !Number.isFinite(bono.creditosTotales);
  const quedan = ilimitado ? Infinity : bono.creditosTotales - bono.creditosUsados;
  const pct = ilimitado ? 100 : (bono.creditosTotales > 0 ? (quedan / bono.creditosTotales) * 100 : 0);
  const tono = bono.estado === 'activo' ? (!ilimitado && quedan <= 1 ? 'few' : 'ok') : 'neutral';
  const etiqueta = bono.estado === 'activo' ? (!ilimitado && quedan === 0 ? 'Sin sesiones' : 'Activo') : bono.estado === 'agotado' ? 'Agotado' : 'Expirado';
  return (
    <Link href={href('/bonos/' + bono.id)} className="card card--tap" style={{ display: 'block', padding: compacta ? '12px 15px' : '15px 17px', opacity: bono.estado === 'activo' ? 1 : .7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <p style={{ margin: 0, fontSize: compacta ? 12.5 : 13.5, fontWeight: 800 }}>{bono.nombre}</p>
        {compacta ? <span className="t-mono" style={{ fontSize: 11, color: 'var(--accent)' }}>quedan {quedan}</span> : <Badge tone={tono}>{etiqueta}</Badge>}
      </div>
      <div style={{ height: compacta ? 5 : 6, borderRadius: 99, background: 'var(--muted)', overflow: 'hidden', marginTop: 9 }}><div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: bono.estado === 'activo' ? 'var(--success)' : 'var(--border-strong)', transition: 'width .6s var(--ease)' }} /></div>
      {!compacta && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <p className="t-meta">{ilimitado ? 'Clases sin límite' : `${quedan} de ${bono.creditosTotales} sesiones`}</p>
          <p className="t-meta t-mono" style={{ fontSize: 10.5 }}>{bono.expiraEn ? (bono.estado === 'expirado' ? 'caducó ' : 'caduca ') + fechaCorta(bono.expiraEn) : 'sin caducidad'}</p>
        </div>
      )}
    </Link>
  );
}
