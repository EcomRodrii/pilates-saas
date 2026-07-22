'use client';

import { useState } from 'react';
import { DARK, MUTED } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { IconAlert, IconCheck } from './icons';

function BeforeAfter() {
  const [pos, setPos] = useState(50);
  return (
    <div>
      <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', minHeight: 260, boxShadow: '0 40px 80px -30px rgba(26,26,26,.32)' }}>
        <div style={{ position: 'absolute', inset: 0, padding: 'clamp(22px,3.6vw,38px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: DARK }}>
          <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7BD3A8', marginBottom: 14 }}>Con Tentare</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(123,211,168,.12)', border: '1px solid rgba(123,211,168,.3)', borderRadius: 14, padding: '14px 16px', marginBottom: 12, maxWidth: 340 }}>
            <span style={{ color: '#7BD3A8', flexShrink: 0 }}>{IconCheck(20)}</span>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Clase cubierta</div><div style={{ fontSize: 12.5, color: '#9FE0C0' }}>Lucía acepta · alumnas avisadas</div></div>
          </div>
          <div className="lp-mono" style={{ fontSize: 12, color: '#8E8E86' }}>0 llamadas · 6 minutos · tú, sin enterarte</div>
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 'clamp(22px,3.6vw,38px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#F3F3EF',
            clipPath: `inset(0 ${100 - pos}% 0 0)`,
          }}
        >
          <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#C2503A', marginBottom: 14 }}>Sin Tentare</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #EFE0DC', borderRadius: 14, padding: '14px 16px', marginBottom: 12, maxWidth: 340 }}>
            <span style={{ color: '#C2503A', flexShrink: 0 }}>{IconAlert(20)}</span>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Grupo de WhatsApp</div><div style={{ fontSize: 12.5, color: '#8E6A5E' }}>14 mensajes sin resolver</div></div>
          </div>
          <div className="lp-mono" style={{ fontSize: 12, color: '#A8887E' }}>6 llamadas · 40 minutos · clase en el aire</div>
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: `${pos}%`, background: '#fff', boxShadow: '0 0 0 1px rgba(26,26,26,.12), 0 8px 20px rgba(0,0,0,.25)', transform: 'translateX(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(0,0,0,.22)' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth={2.4} strokeLinecap="round"><line x1={9} y1={6} x2={9} y2={18} /><line x1={15} y1={6} x2={15} y2={18} /></svg>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Comparar antes y después de Tentare"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'ew-resize', zIndex: 6, appearance: 'none', background: 'transparent' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span className="lp-mono" style={{ fontSize: 11, color: '#C2503A' }}>← Sin Tentare</span>
        <span className="lp-mono" style={{ fontSize: 11, color: '#4E9E7F' }}>Con Tentare →</span>
      </div>
    </div>
  );
}

export function AntesDespues() {
  return (
    <section id="antes-despues" style={{ padding: 'clamp(64px,8vw,104px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ maxWidth: 620, margin: '0 auto clamp(40px,6vw,58px)', textAlign: 'center' }}>
          <Eyebrow>Antes / después</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1.03, letterSpacing: '-.04em', margin: '0 0 14px' }}>Arrastra y compara tu semana.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>Mismo estudio, misma baja de última hora un jueves por la tarde. Así cambia cuando dejas de gestionarla a mano.</p></Reveal>
        </div>
        <Reveal delay={120} style={{ maxWidth: 780, margin: '0 auto' }}>
          <BeforeAfter />
        </Reveal>
      </div>
    </section>
  );
}
