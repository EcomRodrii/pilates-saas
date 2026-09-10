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
        {compacta ? <span className="t-num" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--accent)' }}>quedan {quedan}</span> : <Badge tone={tono}>{etiqueta}</Badge>}
      </div>
      {/* ⚠️ La barra iba pintada a mano, con `--success` fijo, y eso rompía dos
          cosas a la vez.
          · `--success` NO se tiñe con la marca del estudio (a propósito: es el
            verde de «ha ido bien», no un color de identidad). Las sesiones que
            te quedan no son un éxito, son una CANTIDAD — y salían en verde en
            los trece estudios, todos de marca índigo, violeta o tostada.
          · Con una sesión o menos, la etiqueta ya se pone ámbar («few», arriba)
            y la barra seguía verde: la misma tarjeta diciendo «cuidado» y «todo
            bien» a la vez.
          `.bar` del sistema ya hace justo esto: acento por defecto, `--warn`
          cuando toca. El tono sale del MISMO cálculo que la etiqueta, así que no
          pueden volver a contradecirse. */}
      <div
        aria-hidden
        className={'bar' + (tono === 'few' ? ' bar--warn' : tono === 'neutral' ? ' bar--apagada' : '')}
        style={{ ['--pct' as string]: pct + '%', height: compacta ? 5 : 6, marginTop: 9 }}
      >
        <i />
      </div>
      {!compacta && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <p className="t-meta">{ilimitado ? 'Clases sin límite' : `Te quedan ${quedan} de ${bono.creditosTotales}`}</p>
          <p className="t-meta t-num">{bono.expiraEn ? (bono.estado === 'expirado' ? 'caducó ' : 'caduca ') + fechaCorta(bono.expiraEn) : 'sin caducidad'}</p>
        </div>
      )}
    </Link>
  );
}
