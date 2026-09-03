'use client';
import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import type { Pago } from '@/lib/student/tipos';
import { euros, fechaCorta } from '@/lib/student/formato';
import { Badge } from '@/components/student/ui/Badge';
export const ESTADO_PAGO: Record<Pago['estado'], { txt: string; tone: 'ok' | 'few' | 'full' | 'neutral' | 'wait' }> = {
  success: { txt: 'Pagado', tone: 'ok' }, processing: { txt: 'Procesando', tone: 'wait' }, failed: { txt: 'Fallido', tone: 'full' }, cancelled: { txt: 'Cancelado', tone: 'neutral' }, refunded: { txt: 'Reembolsado', tone: 'neutral' },
};
export function PaymentItem({ p, delay = 0 }: { p: Pago; delay?: number }) {
  const href = usePortalHref();
  const e = ESTADO_PAGO[p.estado];
  return (
    <Link href={href('/pagos/' + p.id)} className="card card--tap a-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 14px', animationDelay: delay + 'ms' }}>
      <div style={{ minWidth: 0 }}><p style={{ margin: 0, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.concepto}</p><p className="t-meta" style={{ marginTop: 2 }}>{fechaCorta(p.fecha)} · {p.metodo}</p></div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 800, textDecoration: p.estado === 'refunded' ? 'line-through' : 'none' }}>{euros(p.importe)}</p><div style={{ marginTop: 4 }}><Badge tone={e.tone}>{e.txt}</Badge></div></div>
    </Link>
  );
}
