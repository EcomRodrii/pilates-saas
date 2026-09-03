'use client';
import Link from 'next/link';
export function ProfileSection({ titulo, items }: { titulo: string; items: { label: string; href?: string; onClick?: () => void; valor?: string; destructivo?: boolean }[] }) {
  return (
    <section>
      <p className="t-label" style={{ margin: '0 0 7px' }}>{titulo}</p>
      <div className="card" style={{ overflow: 'hidden' }}>
        {items.map((it, i) => {
          const st: React.CSSProperties = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '13px 15px', minHeight: 48, border: 'none', borderBottom: i < items.length - 1 ? '1px solid var(--muted)' : 'none', background: 'none', fontSize: 13, fontWeight: 700, color: it.destructivo ? 'var(--destructive)' : 'var(--foreground)', textAlign: 'left' };
          const inner = <><span>{it.label}</span><span style={{ color: 'var(--subtle-foreground)', fontSize: 12, fontWeight: 600, display: 'flex', gap: 8 }}>{it.valor}<span aria-hidden>›</span></span></>;
          return it.href ? <Link key={it.label} href={it.href} style={st}>{inner}</Link> : <button key={it.label} type="button" onClick={it.onClick} style={st}>{inner}</button>;
        })}
      </div>
    </section>
  );
}
