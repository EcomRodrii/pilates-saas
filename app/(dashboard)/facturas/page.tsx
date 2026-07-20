'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Las facturas vive ahora dentro de /cobros. Esta ruta se mantiene porque hay enlaces
// vivos apuntando aquí.
//
// La query string se CONSERVA a propósito: /pagos es la url de retorno grabada
// en las sesiones de pago de Stripe ya creadas, y llega con ?stripe_success=1
// &recibo=… Perder esos parámetros dejaría el recibo sin marcar como cobrado.
export default function RedireccionFacturas() {
  const router = useRouter();
  useEffect(() => {
    const qs = window.location.search;
    const extra = qs ? `&${qs.slice(1)}` : '';
    router.replace(`/cobros?tab=facturas${extra}`);
  }, [router]);
  return null;
}
