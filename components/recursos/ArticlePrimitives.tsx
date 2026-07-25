import { ACC } from '@/components/landing/theme';
import { IconCheck } from '@/components/landing/icons';

// Dark stat callout used for "the real cost" / "calendar" figure blocks.
export function StatBlock({ eyebrow, eyebrowColor = '#C08BE8', stats, note }: { eyebrow: string; eyebrowColor?: string; stats: { value: string; label: string }[]; note?: string }) {
  return (
    <div style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 18, padding: '24px 26px', margin: '24px 0' }}>
      <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: eyebrowColor, marginBottom: 14 }}>{eyebrow}</div>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', color: '#fff' }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#A6A69E' }}>{s.label}</div>
          </div>
        ))}
      </div>
      {note && <p style={{ margin: '16px 0 0', fontSize: 12.5, color: '#8F9E9A', lineHeight: 1.5 }}>{note}</p>}
    </div>
  );
}

// Purple/tinted callout box with an icon — "la idea clave" style.
export function Callout({ title, children, bg = '#F1ECFB', border = '#E4D8F7', iconColor = ACC, textColor = '#4A3A5E' }: { title: string; children: React.ReactNode; bg?: string; border?: string; iconColor?: string; textColor?: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: '18px 20px', margin: '26px 0', display: 'flex', gap: 14 }}>
      <span style={{ flexShrink: 0, color: iconColor }}>
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={10} /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
      </span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 3 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: textColor }}>{children}</p>
      </div>
    </div>
  );
}

// White checklist card with green checkmarks.
export function Checklist({ eyebrow, items }: { eyebrow: string; items: React.ReactNode[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px', margin: '22px 0' }}>
      <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5B21B6', marginBottom: 16 }}>{eyebrow}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: '#E7F3EC', color: '#4E9E7F', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{IconCheck(12)}</span>
            <span style={{ fontSize: 15, lineHeight: 1.5, color: '#3A3A34' }}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Two-column "a mano / con Tentare" comparison table.
export function BeforeAfterCols({ beforeLabel, beforeItems, afterLabel, afterItems }: { beforeLabel: string; beforeItems: string[]; afterLabel: string; afterItems: string[] }) {
  return (
    <div style={{ border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden', margin: '22px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ padding: '16px 18px', background: '#FBF6F4', borderRight: '1px solid #E7E7E0' }}>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C2503A', marginBottom: 12 }}>{beforeLabel}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 13.5, color: '#5A5A52', lineHeight: 1.4 }}>
            {beforeItems.map((it) => <div key={it}>{it}</div>)}
          </div>
        </div>
        <div style={{ padding: '16px 18px', background: '#F4F8F5' }}>
          <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4E9E7F', marginBottom: 12 }}>{afterLabel}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 13.5, color: '#3A3A34', lineHeight: 1.4 }}>
            {afterItems.map((it) => (
              <div key={it} style={{ display: 'flex', gap: 7 }}><span style={{ color: '#4E9E7F', flexShrink: 0 }}>✓</span>{it}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CtaBlock({ title, body, href = '/crear-estudio', cta = 'Crear mi estudio →' }: { title: string; body?: string; href?: string; cta?: string }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#6D28D9,#4C1D95)', color: '#fff', borderRadius: 22, padding: 'clamp(28px,4vw,40px)', margin: '44px 0 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 62%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', lineHeight: 1.1, letterSpacing: '-.03em', margin: body ? '0 0 12px' : '0 0 24px', color: '#fff' }}>{title}</h2>
        {body && <p style={{ fontSize: 16, lineHeight: 1.55, color: '#EADEFB', margin: '0 0 24px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>{body}</p>}
        <a href={href} className="hover:-translate-y-0.5 transition-transform" style={{ display: 'inline-block', fontSize: 16, fontWeight: 700, color: ACC, background: '#fff', padding: '15px 30px', borderRadius: 999 }}>{cta}</a>
      </div>
    </div>
  );
}

export function RelatedLinks({ items }: { items: { href: string; category: string; categoryColor: string; title: string }[] }) {
  return (
    <div style={{ marginTop: 48 }}>
      <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 16 }}>Sigue leyendo</div>
      <div className="art-cta2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {items.map((it) => (
          <a key={it.href} href={it.href} className="art-related-card" style={{ display: 'block', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: 20, textDecoration: 'none', color: 'inherit' }}>
            <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: it.categoryColor, marginBottom: 8 }}>{it.category}</div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>{it.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
