'use client';
import Link from 'next/link';
import { Button } from './Button';
export function EmptyState({ icono = '📋', titulo, cuerpo, accion, href, onAccion }: { icono?: string; titulo: string; cuerpo?: string; accion?: string; href?: string; onAccion?: () => void }) {
  return (
    <div className="a-up" style={{ border: '1.5px dashed var(--border-strong)', borderRadius: 18, padding: '28px 20px', textAlign: 'center' }}>
      <span aria-hidden style={{ fontSize: 28 }}>{icono}</span>
      <p style={{ margin: '10px 0 0', fontSize: 14.5, fontWeight: 800 }}>{titulo}</p>
      {cuerpo && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{cuerpo}</p>}
      {accion && (href ? <Link href={href} className="btn btn--primary btn--sm tap" style={{ marginTop: 14, height: 40, fontSize: 12.5, boxShadow: 'none' }}>{accion}</Link> : <Button size="sm" style={{ marginTop: 14, height: 40, fontSize: 12.5, boxShadow: 'none' }} onClick={onAccion}>{accion}</Button>)}
    </div>
  );
}
export function ErrorState({ titulo = 'Algo no ha salido como esperábamos', cuerpo = 'No hemos podido cargar esto. Tus datos están a salvo.', onRetry }: { titulo?: string; cuerpo?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="a-up card" style={{ padding: '22px 20px', textAlign: 'center', borderColor: 'var(--destructive-soft)', background: 'var(--destructive-soft)' }}>
      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--destructive-foreground)' }}>{titulo}</p>
      <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{cuerpo}</p>
      {onRetry && <Button variant="secondary" style={{ marginTop: 14 }} onClick={onRetry}>Intentar de nuevo</Button>}
    </div>
  );
}
export function OfflineState({ cuerpo = 'Lo que ves es lo último que cargamos. Reservar, cancelar y pagar necesitan conexión.' }: { cuerpo?: string }) {
  return (
    <div role="status" className="a-up card" style={{ padding: '18px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ fontSize: 20 }}>📡</span>
      <div><p style={{ margin: 0, fontSize: 13.5, fontWeight: 800 }}>Sin conexión</p><p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{cuerpo}</p></div>
    </div>
  );
}
export function Skeleton({ h = 14, w = '100%', r = 10, style }: { h?: number; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div aria-hidden className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
export function ListSkeleton({ n = 3, h = 74 }: { n?: number; h?: number }) {
  return <div aria-busy aria-label="Cargando" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={h} r={16} />)}</div>;
}
