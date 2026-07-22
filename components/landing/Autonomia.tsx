'use client';

import { useState } from 'react';
import { ACC, DARK, MUTED } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { AUTONOMY_MODES } from './data';

export function Autonomia() {
  const [autonomyMode, setAutonomyMode] = useState<(typeof AUTONOMY_MODES)[number]['key']>('asistido');

  return (
    <section style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <Eyebrow>Niveles de autonomía</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.8vw,56px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 auto 14px', maxWidth: 640 }}>Tú decides cuánto delega.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Del control total a estar en Cancún. Cambia de modo cuando quieras.</p></Reveal>
        </div>
        <Reveal delay={120}>
          <div className="tnt-autbar" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', margin: '0 auto 26px', padding: 6, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 999, width: 'max-content', maxWidth: '100%' }}>
            {AUTONOMY_MODES.map((m) => {
              const active = autonomyMode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setAutonomyMode(m.key)}
                  style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '11px 20px', borderRadius: 999, background: active ? ACC : 'transparent', color: active ? '#fff' : MUTED, transition: 'background .2s, color .2s' }}
                >
                  {m.tab}
                </button>
              );
            })}
          </div>
          {AUTONOMY_MODES.filter((m) => m.key === autonomyMode).map((m) => (
            <div key={m.key} style={{ background: DARK, color: '#E8E8E4', borderRadius: 26, padding: 'clamp(28px,4vw,48px)', minHeight: 220, animation: 'lp-fadeIn .35s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: m.levelColor }}>{m.level}</span>
                <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,.08)' }} />
              </div>
              <h3 style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>{m.title}</h3>
              <p style={{ fontSize: 18, lineHeight: 1.6, color: '#B8B8B0', maxWidth: 620, margin: 0 }}>{m.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
