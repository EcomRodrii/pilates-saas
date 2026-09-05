'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getMetodoPago, quitarTarjeta } from '@/lib/student/pago';
import { Button } from '@/components/student/ui/Button';
import { Sheet } from '@/components/student/ui/Sheet';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Método de pago (§ auditoría: la app GUARDA la tarjeta para cobros
// automáticos y no daba ninguna pantalla para verla ni quitarla, teniendo
// `DELETE /api/public/tarjeta` hecho y huérfano).
//
// Los datos que se enseñan (marca, últimos cuatro, caducidad) ya viajan en el
// payload de la socia: son suyos. El número completo no existe en ninguna parte
// del sistema — lo guarda Stripe, no nosotros.

export default function PagoPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(() => getMetodoPago(estudio.slug), [estudio.slug]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.tieneTarjeta);

  const confirmar = async () => {
    setQuitando(true);
    const error = await quitarTarjeta(estudio.slug, estudio.id);
    setQuitando(false);
    setConfirmando(false);
    if (error) { toast(error); return; }
    toast('Tarjeta eliminada');
    await refrescar();
  };

  return (
    <StudentShell>
      <PageHeader titulo="Método de pago" back />
      <div className="px" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={1} h={110} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver tu método de pago." />}
        {estado === 'empty' && (
          <EmptyState
            icono="💳"
            titulo="No tienes ninguna tarjeta guardada"
            cuerpo="Cuando pagues online podrás guardarla para las próximas veces."
          />
        )}

        {estado === 'ready' && data?.tieneTarjeta && (
          <>
            <div className="card" data-testid="tarjeta" style={{ padding: '15px 16px' }}>
              <p className="t-label" style={{ margin: 0 }}>Tarjeta guardada</p>
              <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 800, letterSpacing: '-.01em' }}>
                {data.marca ? `${data.marca} ` : ''}•••• {data.ultimos4}
              </p>
              {data.caducidad && <p className="t-meta" style={{ margin: '2px 0 0' }}>Caduca {data.caducidad}</p>}
              <p className="t-meta" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                Se usa para los cobros de tus bonos y suscripciones. El número completo
                lo guarda la pasarela de pago, no el estudio.
              </p>
            </div>

            <Button variant="danger" full disabled={!online} onClick={() => setConfirmando(true)}>
              Quitar tarjeta
            </Button>
            <p className="t-meta" style={{ margin: 0, textAlign: 'center', fontSize: 11.5, lineHeight: 1.5 }}>
              Si la quitas, los cobros automáticos de tus renovaciones dejarán de
              funcionar y tendrás que pagarlos a mano.
            </p>
          </>
        )}
      </div>

      <Sheet open={confirmando} onClose={() => setConfirmando(false)} label="Quitar la tarjeta">
        <h3 className="t-h2" style={{ margin: 0, fontSize: 18 }}>¿Quitar tu tarjeta?</h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
          Tus renovaciones dejarán de cobrarse solas. Podrás volver a guardarla la
          próxima vez que pagues.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Button variant="danger" full disabled={quitando} onClick={() => void confirmar()}>
            {quitando ? 'Quitando…' : 'Sí, quitar la tarjeta'}
          </Button>
          <Button variant="ghost" full onClick={() => setConfirmando(false)}>Mantenerla</Button>
        </div>
      </Sheet>
    </StudentShell>
  );
}
