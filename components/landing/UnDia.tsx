'use client';

import { useEffect, useRef, useState } from 'react';
import { ACC, CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { DAY_MOMENTS } from './data';

export function UnDia() {
  return (
    <section style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(76px,9vw,124px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-8%', right: '-6%', width: 'min(680px,80vw)', height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.18), transparent 66%)', pointerEvents: 'none' }} />
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div style={{ maxWidth: 700, marginBottom: 'clamp(40px,6vw,64px)' }}>
          <Eyebrow color="#C08BE8">Un día con Tentare · ejemplo</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.8vw,56px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 16px', color: '#fff' }}>De las 7:00 a las 22:00,<br />sin una sola llamada.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Así se ve un martes cualquiera en un estudio que funciona con Tentare. Cada hora, una automatización distinta trabajando por ti. <span style={{ color: '#7E7E77' }}>(Ejemplo ilustrativo con datos ficticios.)</span></p></Reveal>
        </div>
        <DayTimeline />
      </div>
    </section>
  );
}

// Day timeline with a scroll-linked progress fill running down the rail,
// matching the source design's data-day-fill behavior.
function DayTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh * 0.5;
      const scrolled = vh * 0.75 - rect.top;
      setPct(Math.min(1, Math.max(0, scrolled / total)));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 8, bottom: 8, left: 91, width: 2, background: 'rgba(255,255,255,.1)', borderRadius: 2 }} className="tnt-daybg" />
      <div
        style={{ position: 'absolute', top: 8, left: 91, width: 2, height: `${pct * 100}%`, background: `linear-gradient(${ACC}, #4C1D95)`, boxShadow: '0 0 12px rgba(124,58,237,.55)', borderRadius: 2, transition: 'height .1s linear' }}
        className="tnt-dayfill"
      />
      {DAY_MOMENTS.map((m) => (
        <div key={m.t} className="tnt-moment" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '72px 40px 1fr', alignItems: 'start', paddingBottom: 30 }}>
          <div className="lp-mono" style={{ textAlign: 'right', paddingTop: 18, fontSize: 13, color: '#8E8E86' }}>{m.t}</div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: DARK, border: `2px solid ${ACC}`, boxShadow: m.highlight ? '0 0 0 5px rgba(109,40,217,.22)' : '0 0 0 4px rgba(109,40,217,.12)' }} />
          </div>
          <Reveal
            style={
              m.highlight
                ? { background: 'linear-gradient(150deg,#1c1440,#171717 70%)', border: '1px solid rgba(124,58,237,.5)', borderRadius: 18, padding: '20px 22px' }
                : m.good
                  ? { background: 'linear-gradient(135deg,#6D28D9,#4C1D95)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 30px 60px -30px rgba(109,40,217,.7)' }
                  : { background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '20px 22px' }
            }
          >
            {m.badge && (
              <div className="lp-mono" style={{ display: 'inline-block', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: ACC, padding: '4px 10px', borderRadius: 999, marginBottom: 12 }}>
                {m.badge}
              </div>
            )}
            <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: '-.01em' }}>{m.title}</h3>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: m.good ? '#EADEFB' : '#A6A69E', margin: '0 0 14px' }}>{m.body}</p>
            <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: m.good ? 'rgba(255,255,255,.14)' : m.highlight ? 'rgba(124,58,237,.16)' : 'rgba(124,58,237,.12)', border: m.good ? 'none' : '1px solid rgba(124,58,237,.22)', borderRadius: 999, padding: '7px 12px', fontSize: 11, color: m.good ? '#fff' : '#CBB6EE' }}>
              {m.tag}
            </div>
          </Reveal>
        </div>
      ))}
    </div>
  );
}
