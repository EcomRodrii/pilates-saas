'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { usePortalHref } from '@/components/student/contexto';
import { BookingStatus } from '@/components/student/domain/BookingStatus';
import type { BookingState } from '@/lib/student/tipos';

type EstadoFinal = Exclude<BookingState, 'idle' | 'reviewing' | 'submitting'>;

const VALIDOS: readonly EstadoFinal[] = [
  'confirmed', 'waitlisted', 'full', 'conflict', 'duplicate', 'session-expired', 'offline', 'error',
];

// Confirmación por URL (§A.8). Existe para que un desenlace se pueda enlazar:
// el retorno de un pago, un correo, o volver atrás sin perder el resultado.
//
// ⚠️ El paquete hace `(sp.get('state') ?? 'confirmed')`. Eso significa que
// /reservar/confirmacion SIN parámetro —o con uno inventado— enseña «Reserva
// confirmada». En una maqueta es cómodo; en producción es enseñarle a una
// alumna una confirmación que nadie ha confirmado, que es exactamente lo que el
// resto de la fase se dedica a impedir.
//
// Aquí un valor ausente o desconocido cae en `error`, que invita a reintentar y
// no promete nada. Quien SÍ sabe el desenlace lo trae en la URL.
function Contenido() {
  const sp = useSearchParams();
  const router = useRouter();
  const href = usePortalHref();

  const crudo = sp.get('state');
  const estado: EstadoFinal = VALIDOS.includes(crudo as EstadoFinal) ? (crudo as EstadoFinal) : 'error';

  return (
    <div className="px" style={{ maxWidth: 420, margin: '40px auto 0' }}>
      <BookingStatus
        state={estado}
        onRetry={() => router.back()}
        onWaitlist={() => router.back()}
        onClose={() => router.push(
          estado === 'confirmed' || estado === 'waitlisted'
            ? href('/mis-reservas')
            // ⚠️ `session-expired` iba al HORARIO, con un botón que dice
            // «Iniciar sesión». Acababa en el acceso igualmente porque la
            // guardia de sesión rebota, pero por accidente y enseñando de paso
            // una pantalla que nadie había pedido. La ficha de clase
            // (`finalizar`) ya lo hacía bien: era esta la que se desviaba.
            : estado === 'session-expired' ? href('/acceso/login') : href('/reservar'),
        )}
      />
    </div>
  );
}

export default function ConfirmacionPage() {
  return (
    <StudentShell>
      {/* `useSearchParams` obliga a un límite de Suspense en el App Router: sin
          él, esta ruta fuerza el render dinámico de todo el segmento. */}
      <Suspense fallback={<div className="px" style={{ minHeight: 240 }} />}>
        <Contenido />
      </Suspense>
    </StudentShell>
  );
}
