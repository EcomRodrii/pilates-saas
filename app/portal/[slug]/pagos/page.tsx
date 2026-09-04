'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getPagos } from '@/lib/student/datos';
import { PaymentItem } from '@/components/student/domain/PaymentItem';
import { useToast } from '@/components/student/ui/Toast';
import { avisoDeRetorno } from '@/lib/student/retorno-pago';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Pagos (§A.14). Es la primera vez que una alumna de Tentare puede ver sus
// recibos: hasta ahora los datos viajaban en el payload y no había ni una línea
// de interfaz que los pintara, ni en el portal borrado ni en /reservar.
//
// Solo lectura. Nada de esta pantalla mueve dinero.
function Pagos() {
  const { estudio } = useEstudio();
  const cargar = useCallback(() => getPagos(estudio.slug), [estudio.slug]);
  const { data, estado, reintentar } = useAsync(cargar);

  // Retorno de Stripe al guardar tarjeta o domiciliación (`setup-tarjeta` y
  // `setup-sepa` vuelven aquí). Sin esto, la alumna guardaba su tarjeta y
  // aterrizaba en una lista de recibos sin que nada dijera que se había
  // guardado: un éxito mudo se lee como un fallo.
  const sp = useSearchParams();
  const { toast } = useToast();
  const yaTratado = useRef(false);
  useEffect(() => {
    if (yaTratado.current) return;
    const aviso = avisoDeRetorno(sp);
    if (!aviso) return;
    yaTratado.current = true;
    toast(aviso.mensaje);
  }, [sp, toast]);

  return (
    <StudentShell>
      <PageHeader titulo="Pagos" sub="Recibos y estado de cada cobro" back />

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={66} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && (
          <OfflineState cuerpo="Los recibos se mostrarán cuando vuelva la conexión." />
        )}
        {estado === 'empty' && (
          <EmptyState icono="🧾" titulo="Sin pagos todavía" cuerpo="Aquí aparecerán tus recibos." />
        )}
        {estado === 'ready' && data?.map((p, i) => <PaymentItem key={p.id} p={p} delay={i * 55} />)}
      </div>
    </StudentShell>
  );
}

export default function PagosPage() {
  return (
    <Suspense fallback={null}>
      <Pagos />
    </Suspense>
  );
}
