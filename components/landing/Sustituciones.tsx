'use client';

import { useEffect, useRef, useState } from 'react';
import { ACC, CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Reveal } from './Reveal';
import { IconCheck } from './icons';
import { FLOW_STEPS } from './data';

export function Sustituciones() {
  return (
    <section id="sustituciones" style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(76px,9vw,124px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 'min(900px,90vw)', height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.24), transparent 66%)', pointerEvents: 'none' }} />
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto clamp(48px,6vw,72px)' }}>
          <Reveal className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fff', background: ACC, padding: '8px 15px', borderRadius: 999, marginBottom: 22 }}>
            ★ La función estrella de Tentare
          </Reveal>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,62px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 18px' }}>Cubre las bajas de instructoras <span style={{ color: '#C08BE8' }}>solo</span>.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 19, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Casi ningún software de estudio lo resuelve de verdad. Cuando una instructora avisa de que no puede, Tentare ejecuta el flujo entero — de la baja a las alumnas avisadas. Tú solo apruebas.</p></Reveal>
        </div>

        <Reveal delay={120} style={{ position: 'relative', background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 26, padding: 'clamp(30px,4vw,50px) clamp(20px,4vw,40px)', overflow: 'hidden' }}>
          <SustitucionesFlow />
        </Reveal>
      </div>
    </section>
  );
}

// Animated flow: steps light up in sequence with a comet-like progress line
// once the block scrolls into view, then reveals a "done" badge — matching
// the source design's data-flow / data-flow-comet behavior.
function SustitucionesFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.unobserve(el);
        FLOW_STEPS.forEach((_, i) => {
          setTimeout(() => setStep(i), 500 + i * 750);
        });
        setTimeout(() => setDone(true), 500 + FLOW_STEPS.length * 750 + 300);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const progressPct = step < 0 ? 0 : (step / (FLOW_STEPS.length - 1)) * 100;
  const cometLeft = 12.5 + progressPct * 0.75;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Horizontal line — desktop / multi-column layout only */}
      <div style={{ position: 'absolute', top: 30, left: '12.5%', right: '12.5%', height: 3, background: 'rgba(255,255,255,.1)', zIndex: 0 }} className="tnt-flowline" />
      <div
        className="tnt-flowline"
        style={{ position: 'absolute', top: 30, left: '12.5%', width: `${progressPct * 0.75}%`, height: 3, background: ACC, zIndex: 1, transition: 'width .6s ease', boxShadow: '0 0 12px rgba(124,58,237,.6)' }}
      />
      <div
        className="tnt-flowline tnt-flow-comet"
        style={{
          position: 'absolute',
          top: 30,
          left: `${cometLeft}%`,
          width: 14,
          height: 14,
          marginLeft: -7,
          marginTop: -6,
          borderRadius: '50%',
          background: '#fff',
          zIndex: 2,
          opacity: step >= 0 && !done ? 1 : 0,
          transition: 'left .6s ease, opacity .4s',
        }}
      />
      {/* Vertical rail — single-column mobile layout, mirrors UnDia's timeline rail */}
      <div className="tnt-flow-vline-bg" style={{ position: 'absolute', top: 30, bottom: 64, left: '50%', width: 3, background: 'rgba(255,255,255,.1)', transform: 'translateX(-50%)', zIndex: 0 }} />
      <div
        className="tnt-flow-vline-fill"
        style={{ position: 'absolute', top: 30, left: '50%', width: 3, height: `${progressPct}%`, background: ACC, transform: 'translateX(-50%)', zIndex: 1, transition: 'height .6s ease', boxShadow: '0 0 12px rgba(124,58,237,.6)' }}
      />
      <div className="tnt-steps4" style={{ position: 'relative', zIndex: 2 }}>
        {FLOW_STEPS.map((s, i) => {
          const active = step >= i;
          return (
            <div key={s.title} style={{ textAlign: 'center', transition: 'opacity .5s' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: active ? ACC : CARD_DARK,
                  border: `2px solid ${active ? ACC : 'rgba(255,255,255,.14)'}`,
                  color: active ? '#fff' : '#8E8E86',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  transition: 'all .4s cubic-bezier(.2,.7,0,1)',
                }}
              >
                {s.icon(24)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{s.title}</div>
              <div
                className="lp-mono"
                style={{
                  fontSize: 11,
                  color: '#8E8E86',
                  lineHeight: 1.4,
                  opacity: active ? 1 : 0,
                  transform: active ? 'none' : 'translateY(6px)',
                  transition: 'opacity .5s ease, transform .5s ease',
                }}
              >
                {s.cap}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 28,
          opacity: done ? 1 : 0,
          transform: done ? 'none' : 'translateY(6px) scale(.96)',
          transition: 'opacity .5s ease, transform .5s cubic-bezier(.2,1.4,.4,1)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            background: 'rgba(78,158,127,.14)',
            color: '#7BD3A8',
            fontSize: 14,
            fontWeight: 700,
            padding: '10px 18px',
            borderRadius: 999,
            border: '1px solid rgba(123,211,168,.28)',
          }}
        >
          {IconCheck(16)} Clase cubierta · nadie tocó el teléfono
        </span>
      </div>
      <div style={{ position: 'relative', textAlign: 'center', marginTop: 30, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Y tú, mientras tanto, dabas tu clase.</span>
      </div>
    </div>
  );
}
