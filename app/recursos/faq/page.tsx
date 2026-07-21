'use client';

import { useState } from 'react';
import { MarketingShell } from '@/components/marketing/shell';
import { FAQ_ITEMS } from '@/lib/faq-items';

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 44px', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Preguntas frecuentes
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', margin: 0 }}>Antes de que preguntes</h1>
      </section>
      <section style={{ padding: '0 40px 110px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    padding: '18px 22px', textAlign: 'left', fontSize: 16, fontWeight: 700, letterSpacing: '-.01em',
                    color: '#1A1A1A', background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span>{item.q}</span>
                  <span
                    style={{
                      flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                      background: isOpen ? '#FFC8E2' : '#F3F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 600, color: '#171717', transition: 'transform .2s', transform: isOpen ? 'rotate(45deg)' : 'none',
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <p style={{ margin: 0, padding: '0 22px 20px', fontSize: 14.5, lineHeight: 1.6, color: '#5A5A52' }}>{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </MarketingShell>
  );
}
