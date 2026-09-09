'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getPagos } from '@/lib/student/datos';
import { euros, fechaLarga, unir } from '@/lib/student/formato';
import { Badge } from '@/components/student/ui/Badge';
import { ErrorState, Skeleton } from '@/components/student/ui/States';
import { ESTADO_PAGO } from '@/components/student/domain/PaymentItem';
import { getFacturaDeRecibo, type FacturaDeSocia } from '@/lib/student/factura-datos';
import { abrirFacturaPDF } from '@/lib/factura-pdf';
import { Button } from '@/components/student/ui/Button';

// Recibo (§A.15).
//
// ⚠️ DOS BOTONES DEL PAQUETE NO ESTÁN, y no es un olvido:
//
// «Descargar factura» · YA ESTÁ (ver más abajo). La cautela de antes era
// correcta y apuntaba al CÓMO: no había ruta que sirviera una factura a una
// alumna, y poner un botón que enseñara un toast de «pendiente» habría sido
// peor que no ponerlo. Ahora existe `/api/public/factura`, de SOLO LECTURA y
// con la identidad derivada del JWT — entregar a la clienta su propia factura
// ya emitida es para lo que existe una factura; lo que sigue sin poder hacerse
// desde aquí es crearla, alterarla o re-emitirla.
//
// Y si el recibo no tiene factura (35 de 73 en producción no la llevan), el
// botón no aparece y se mantiene el respaldo de «pídesela al estudio».
//
// «Intentar el pago de nuevo» · Reintentar un cobro fallido desde la app abre un
// camino de dinero nuevo. Hoy el reintento con la tarjeta guardada existe pero
// es de PERSONAL (`/api/stripe/charge-off-session` exige `verificarSesionStaff`
// y `puedeMoverDinero`). Abrirlo a la alumna es F6 de backend, con su propia
// revisión.
//
// Lo que sí se enseña es el estado real y qué significa, que es lo que evita la
// llamada al estudio preguntando si le han cobrado.
export default function ReciboPage() {
  const { pagoId } = useParams<{ pagoId: string }>();
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const cargar = useCallback(
    async () => (await getPagos(estudio.slug)).find((p) => p.id === pagoId) ?? null,
    [estudio.slug, pagoId],
  );
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  // ⚠️ La factura se pide AL MONTAR, no al pulsar. `abrirFacturaPDF` hace
  // `window.open`, y el navegador lo bloquea si sale de un callback asíncrono
  // en vez de directamente del clic. Mismo motivo, escrito ya, que en
  // `components/pos/boton-factura.tsx`.
  const [factura, setFactura] = useState<FacturaDeSocia | null>(null);
  useEffect(() => {
    let vigente = true;
    if (!data?.id) return;
    void getFacturaDeRecibo(estudio.id, data.id).then((f) => { if (vigente) setFactura(f); });
    return () => { vigente = false; };
  }, [estudio.id, data?.id]);

  if (estado === 'loading') {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <Skeleton h={30} w="40%" />
          <Skeleton h={220} r={20} style={{ marginTop: 14 }} />
        </div>
      </StudentShell>
    );
  }

  if (!data) {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState titulo="No encontramos este pago" onRetry={reintentar} />
        </div>
      </StudentShell>
    );
  }

  const e = ESTADO_PAGO[data.estado];

  return (
    <StudentShell>
      <PageHeader titulo="Recibo" back />

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14, maxWidth: 520 }}>
        <div className="card a-pop" style={{ padding: '22px 18px', textAlign: 'center' }}>
          <Badge tone={e.tone}>{e.txt}</Badge>
          <p
            className="t-display t-num"
            style={{
              marginTop: 'var(--s-3)',
              // Ver la nota de abajo: un recibo devuelto por el banco sigue
              // siendo deuda, así que su importe NO se tacha — tachar dice
              // «esto ya no cuenta», y aquí cuenta.
              textDecoration: 'none',
            }}
          >
            {euros(data.importe)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--t-body)', fontWeight: 700 }}>{data.concepto}</p>
          <p className="t-meta" style={{ marginTop: 3 }}>
            {unir(fechaLarga(data.fecha), data.metodo)}
          </p>

          {/* Los cuatro avisos comparten forma: son `.note` del sistema, no
              cuatro párrafos con su propio color y su propio margen escritos a
              mano. El TONO distingue la gravedad. */}
          {data.estado === 'pending' && (
            // Un recibo emitido y sin cobrar. Antes caía en el texto de
            // «procesando» y le prometía a la alumna un aviso que nadie iba a
            // mandarle: no hay ningún cobro en marcha que confirmar.
            <p className="note note--warn" style={{ marginTop: 'var(--s-3)', textAlign: 'left' }}>
              Este recibo todavía está sin cobrar. Lo gestiona el estudio.
            </p>
          )}
          {data.estado === 'processing' && (
            <p className="note note--warn" style={{ marginTop: 'var(--s-3)', textAlign: 'left' }}>
              El banco todavía no ha confirmado el cobro. Te avisaremos.
            </p>
          )}
          {data.estado === 'failed' && (
            <p className="note note--danger" style={{ marginTop: 'var(--s-3)', textAlign: 'left' }}>
              El pago no se completó y no se ha hecho ningún cargo. Habla con el estudio para volver a intentarlo.
            </p>
          )}
          {/* ⚠️ `refunded` NO es «te devolvimos el dinero»: sale de
              `recibos.estado = 'DEVUELTO'` (lib/student/mapeo.ts), que en el
              panel se lee «Devuelto por el banco» — es decir, el cobro se
              intentó, el banco lo rechazó y el importe SIGUE DEBIÉNDOSE. El
              texto anterior decía justo lo contrario, y con el bloqueo por
              impago encendido la alumna leía «este importe se te devolvió»
              mientras el sistema no la dejaba reservar por deberlo. */}
          {data.estado === 'refunded' && (
            <p className="note note--danger" style={{ marginTop: 'var(--s-3)', textAlign: 'left' }}>
              El banco devolvió este recibo, así que el pago no llegó a completarse. Habla con el estudio para resolverlo.
            </p>
          )}
        </div>

        <div className="card" style={{ padding: '12px 14px', fontSize: 'var(--t-small)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Emitido por</span>
            <b style={{ textAlign: 'right' }}>{estudio.nombre}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Referencia</span>
            <b className="t-code">{data.id.toUpperCase()}</b>
          </div>
          {data.bonoId && (
            <Link href={href(`/bonos/${data.bonoId}`)} style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
              Ver el bono →
            </Link>
          )}
        </div>

        {/* Con factura emitida, se descarga. Sin ella, el respaldo de siempre:
            no tener factura NO es un error, es lo normal en más de la mitad de
            los recibos, y un botón que fallara sería peor que esta línea. */}
        {factura ? (
          <Button
            full
            onClick={() => abrirFacturaPDF(factura.factura, factura.emisor, factura.receptor)}
            style={{ height: 'var(--h-control-md)' }}
          >
            Descargar factura
          </Button>
        ) : (
          <p className="t-meta" style={{ textAlign: 'center', lineHeight: 1.5 }}>
            ¿Necesitas la factura? Pídesela al estudio: {estudio.email || estudio.telefono || estudio.nombre}.
          </p>
        )}
      </div>
    </StudentShell>
  );
}
