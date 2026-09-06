'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getPagos } from '@/lib/student/datos';
import { euros, fechaLarga } from '@/lib/student/formato';
import { Badge } from '@/components/student/ui/Badge';
import { ErrorState, Skeleton } from '@/components/student/ui/States';
import { ESTADO_PAGO } from '@/components/student/domain/PaymentItem';

// Recibo (§A.15).
//
// ⚠️ DOS BOTONES DEL PAQUETE NO ESTÁN, y no es un olvido:
//
// «Descargar recibo» · No existe ninguna ruta que le sirva a una alumna su
// recibo o su factura. Las dos de `app/api/facturas/*` son `verificarSesionStaff`
// (rectificar y sellar), y la factura es un documento fiscal sellado con
// Veri*Factu: crear un endpoint público que lo entregue es una decisión de
// producto y de cumplimiento, no un botón. Poner el botón enseñando un toast de
// «pendiente» sería peor: promete algo que no va a pasar.
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
              textDecoration: data.estado === 'refunded' ? 'line-through' : 'none',
            }}
          >
            {euros(data.importe)}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700 }}>{data.concepto}</p>
          <p className="t-meta" style={{ marginTop: 3 }}>
            {fechaLarga(data.fecha)}{data.metodo ? ` · ${data.metodo}` : ''}
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
          {data.estado === 'refunded' && (
            <p className="note note--info" style={{ marginTop: 'var(--s-3)', textAlign: 'left' }}>
              Este importe se te devolvió.
            </p>
          )}
        </div>

        <div className="card" style={{ padding: '12px 14px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Emitido por</span>
            <b style={{ textAlign: 'right' }}>{estudio.nombre}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Referencia</span>
            <b className="t-mono">{data.id.toUpperCase()}</b>
          </div>
          {data.bonoId && (
            <Link href={href(`/bonos/${data.bonoId}`)} style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
              Ver el bono →
            </Link>
          )}
        </div>

        <p className="t-meta" style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 1.5 }}>
          ¿Necesitas la factura? Pídesela al estudio: {estudio.email || estudio.telefono || estudio.nombre}.
        </p>
      </div>
    </StudentShell>
  );
}
