'use client';

import { useState } from 'react';
import { ACC, ACC_SOFT } from '@/components/landing/theme';

export function ArticleFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '17px 20px', fontSize: 15.5, fontWeight: 700, color: '#1A1A1A' }}
            >
              <span>{item.q}</span>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, transition: 'transform .2s', transform: isOpen ? 'rotate(45deg)' : 'none' }}>+</span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: '0 20px 18px', fontSize: 14.5, lineHeight: 1.6, color: '#5A5A52' }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
