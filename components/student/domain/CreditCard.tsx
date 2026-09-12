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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, gap: 10 }}>
          {/* ⚠️ La cifra que da nombre a la pantalla iba en `--t-meta`: 11,5 px
              y gris, el mismo peso visual que la fecha de caducidad de al
              lado. «¿Cuántas me quedan?» es la única pregunta con la que se
              abre Bonos, y había que leer una frase para responderla.
              `--t-display` es el escalón que la propia hoja define como «un
              importe, un saldo: la cifra que se viene a mirar», y hasta ahora
              solo lo usaba el detalle de un recibo.

              Sigue siendo una sola tarjeta: el número no añade una fila, se
              come la que ya había. Y el texto largo se queda debajo en
              pequeño, porque «de 8» es lo que da sentido al 5. */}
          <div style={{ minWidth: 0 }}>
            {ilimitado ? (
              <p className="t-card-title">Clases sin límite</p>
            ) : (
              <>
                {/* ⚠️ «Te quedan» ENCIMA de la cifra, y no «5 · sesiones de 8».
                    El primer intento de esta tarjeta ponía el número solo con
                    «sesiones de 8» debajo, y eso se lee «5 sesiones de 8», o
                    sea «llevo 5 hechas» — que es exactamente el bug que
                    `student-bono-detalle.spec.ts` fijó en su día («la barra se
                    llena con lo que QUEDA»). El guardia lo cazó al primer
                    intento. La cifra se agranda; el verbo que la desambigua no
                    se quita. */}
                <p className="t-label">Te quedan</p>
                <p className="t-display t-num" data-testid="bono-restantes" style={{ marginTop: 1 }}>{quedan}</p>
                <p className="t-meta" style={{ marginTop: 1 }}>
                  de {bono.creditosTotales} {bono.creditosTotales === 1 ? 'sesión' : 'sesiones'}
                </p>
              </>
            )}
          </div>
          <p className="t-meta t-num" style={{ flexShrink: 0, textAlign: 'right' }}>{bono.expiraEn ? (bono.estado === 'expirado' ? 'caducó ' : 'caduca ') + fechaCorta(bono.expiraEn) : 'sin caducidad'}</p>
        </div>
      )}
    </Link>
  );
}
