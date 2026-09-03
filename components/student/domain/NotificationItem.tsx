'use client';
import Link from 'next/link';
import type { Notificacion } from '@/lib/student/tipos';
import { relativo } from '@/lib/student/formato';
const ICO: Record<Notificacion['tipo'], string> = { 'plaza-liberada': '🎉', recordatorio: '⏰', bono: '🎟', estudio: '📣', valorar: '⭐' };
export function NotificationItem({ n, delay = 0 }: { n: Notificacion; delay?: number }) {
  const inner = (
    <>
      <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, background: n.leida ? 'var(--muted)' : 'var(--accent-soft)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ICO[n.tipo]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: n.leida ? 700 : 800, lineHeight: 1.35 }}>{n.titulo}</p>
        <p className="t-meta" style={{ marginTop: 2, lineHeight: 1.45 }}>{n.cuerpo}</p>
        <p className="t-mono" style={{ margin: '4px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{relativo(n.fecha)}</p>
      </div>
      {!n.leida && <span aria-label="Sin leer" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 99, background: '#4F8A5B', marginTop: 6 }} />}
    </>
  );
  const st: React.CSSProperties = { display: 'flex', gap: 11, padding: '12px 14px', background: n.leida ? 'var(--card)' : 'var(--accent-soft)', border: '1px solid ' + (n.leida ? 'var(--border)' : '#CFE0CE'), borderRadius: 14, animationDelay: delay + 'ms' };
  return n.enlace ? <Link href={n.enlace} className="card--tap a-up" style={st}>{inner}</Link> : <div className="a-up" style={st}>{inner}</div>;
}
