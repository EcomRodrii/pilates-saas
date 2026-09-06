'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Pago } from '@/lib/student/tipos';
import { euros, fechaCorta } from '@/lib/student/formato';
import { Badge } from '@/components/student/ui/Badge';
export const ESTADO_PAGO: Record<Pago['estado'], { txt: string; tone: 'ok' | 'few' | 'full' | 'neutral' | 'wait' }> = {
  success: { txt: 'Pagado', tone: 'ok' },
  // «Pendiente» ≠ «Procesando». Ver el mapa de `lib/student/mapeo.ts`: uno es
  // un recibo sin cobrar y el otro un adeudo saliendo del banco.
  pending: { txt: 'Pendiente', tone: 'few' },
  processing: { txt: 'Procesando', tone: 'wait' },
  failed: { txt: 'Fallido', tone: 'full' },
  cancelled: { txt: 'Cancelado', tone: 'neutral' },
  // ⚠️ `refunded` sale de `recibos.estado = 'DEVUELTO'` (lib/student/mapeo.ts),
  // que el panel llama «Devuelto por el banco»: el cobro se intentó, el banco
  // lo rechazó y el importe SIGUE DEBIÉNDOSE. Decía «Reembolsado» en tono
  // neutro, o sea lo contrario, y con el bloqueo por impago encendido la
  // alumna leía que le habían devuelto el dinero mientras el sistema no la
  // dejaba reservar por deberlo. Mismo texto que el panel, a propósito.
  refunded: { txt: 'Devuelto por el banco', tone: 'full' },
};
export function PaymentItem({ p, delay = 0 }: { p: Pago; delay?: number }) {
  const href = usePortalHref();
  const e = ESTADO_PAGO[p.estado];
  return (
    <Link href={href('/pagos/' + p.id)} className="card card--tap a-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', animationDelay: delay + 'ms' }}>
      <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.concepto}</p>{/* ⚠️ El separador va CONDICIONADO, y el paquete lo pone fijo. Sus mocks
            siempre traen método de cobro («Apple Pay», «Tarjeta ···· 4242»);
            en producción `recibos.metodo_cobro` puede estar a NULL —un cobro
            en mano, por ejemplo— y entonces la línea quedaba en «vie 3 jul · »,
            con el punto colgando. Mismo tamaño, mismo tono, misma posición. */}
        <p className="t-meta" style={{ marginTop: 2 }}>{fechaCorta(p.fecha)}{p.metodo ? ` · ${p.metodo}` : ''}</p></div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 800, // Sin tachar: tachar el importe dice «esto ya no cuenta», y una devolución
      // del banco es justo lo contrario — sigue siendo deuda.
      textDecoration: 'none' }}>{euros(p.importe)}</p><div style={{ marginTop: 4 }}><Badge tone={e.tone}>{e.txt}</Badge></div></div>
    </Link>
  );
}
