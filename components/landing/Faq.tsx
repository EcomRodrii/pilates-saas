'use client';

import { useState } from 'react';
import { ACC, ACC_SOFT } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { FAQ_ITEMS } from './data';

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 22px',
                textAlign: 'left',
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: '#1A1A1A',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>{item.q}</span>
              <span
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: ACC_SOFT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  color: ACC,
                  transition: 'transform .2s',
                  transform: isOpen ? 'rotate(45deg)' : 'none',
                }}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: '0 22px 20px', fontSize: 15, lineHeight: 1.6, color: '#5A5A52', animation: 'lp-fadeIn .25s ease both' }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Faq() {
  return (
    <section id="faq" style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4vw,44px)', lineHeight: 1.05, letterSpacing: '-.04em', margin: 0 }}>Antes de que preguntes.</h2></Reveal>
        </div>
        <Reveal delay={120}><FaqAccordion /></Reveal>
      </div>
    </section>
  );
}
