import Link from 'next/link';
import { Check } from 'lucide-react';
import { ACC } from '@/components/landing/theme';

// Dark stat callout used for "the real cost" / "calendar" figure blocks.
export function StatBlock({ eyebrow, stats, note }: { eyebrow: string; eyebrowColor?: string; stats: { value: string; label: string }[]; note?: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--w-linea)', borderBottom: '1px solid var(--w-linea)', padding: '20px 0', margin: '26px 0' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w-texto)', marginBottom: 12 }}>{eyebrow}</div>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.03em', color: 'var(--w-texto)' }}>{s.value}</div>
            <div style={{ fontSize: 14, color: 'var(--w-texto-3)' }}>{s.label}</div>
          </div>
        ))}
      </div>
      {note && <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--w-texto-3)', lineHeight: 1.5 }}>{note}</p>}
    </div>
  );
}

// Purple/tinted callout box with an icon — "la idea clave" style.
export function Callout({ title, children }: { title: string; children: React.ReactNode; bg?: string; border?: string; iconColor?: string; textColor?: string }) {
  return (
    <aside style={{ borderLeft: `3px solid ${ACC}`, padding: '2px 0 2px 18px', margin: '26px 0' }}>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.65, color: 'var(--w-texto)' }}>
        <strong style={{ color: 'var(--w-texto)' }}>{title}.</strong> {children}
      </p>
    </aside>
  );
}

// White checklist card with green checkmarks.
export function Checklist({ eyebrow, items }: { eyebrow: string; items: React.ReactNode[] }) {
  return (
    <div style={{ margin: '22px 0' }}>
      <p style={{ margin: '0 0 10px', fontWeight: 700, color: 'var(--w-texto)' }}>{eyebrow}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Check size={18} aria-hidden style={{ flexShrink: 0, color: ACC, marginTop: 5 }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Two-column "a mano / con Tentare" comparison table.
export function BeforeAfterCols({ beforeLabel, beforeItems, afterLabel, afterItems }: { beforeLabel: string; beforeItems: string[]; afterLabel: string; afterItems: string[] }) {
  return (
    <div className="art-cta2" style={{ margin: '22px 0' }}>
      <div>
        <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--w-texto)' }}>{beforeLabel}</p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>{beforeItems.map((it) => <li key={it} style={{ margin: '4px 0' }}>{it}</li>)}</ul>
      </div>
      <div>
        <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--w-texto)' }}>{afterLabel}</p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>{afterItems.map((it) => <li key={it} style={{ margin: '4px 0' }}>{it}</li>)}</ul>
      </div>
    </div>
  );
}

export function CtaBlock({ title, body, href = '/crear-estudio', cta = 'Crear mi estudio →' }: { title: string; body?: string; href?: string; cta?: string }) {
  return (
    <div style={{ background: ACC, color: '#fff', borderRadius: 24, padding: 'clamp(26px,4vw,36px)', margin: '44px 0 0', textAlign: 'center' }}>
      <div>
        <h2 style={{ fontWeight: 600, fontSize: 'clamp(24px,3vw,34px)', lineHeight: 1.1, letterSpacing: '-.03em', margin: body ? '0 0 12px' : '0 0 24px', color: '#fff' }}>{title}</h2>
        {body && <p style={{ fontSize: 16, lineHeight: 1.55, color: '#E8EBDD', margin: '0 0 24px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>{body}</p>}
        <a href={href} className="hover:-translate-y-0.5 transition-transform" style={{ display: 'inline-block', fontSize: 16, fontWeight: 700, color: ACC, background: '#fff', padding: '15px 30px', borderRadius: 999 }}>{cta}</a>
      </div>
    </div>
  );
}

/**
 * «Sigue leyendo» de las guías con carpeta propia: la MISMA forma que el de los
 * artículos de datos (ArticulosRelacionados, estilos `.art-rel*` en ArticleShell).
 * `categoryColor` ya no se pinta (#2458: sin colores por categoría); se queda en
 * el tipo para no tocar a quien lo pasa.
 */
export function RelatedLinks({ items }: { items: { href: string; category: string; categoryColor?: string; title: string }[] }) {
  return (
    <section aria-labelledby="sigue-leyendo" className="art-rel">
      <h2 id="sigue-leyendo">Sigue leyendo</h2>
      <ul className="art-rel-lista">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="art-rel-tarjeta">
              <span className="art-rel-cat">{it.category}</span>
              <span className="art-rel-titulo">{it.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="art-rel-mas"><Link href="/recursos">Ver todas las guías para tu estudio →</Link></p>
    </section>
  );
}
