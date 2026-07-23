import Image from 'next/image';
import { MUTED } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { DISCIPLINAS } from './data';

export function Disciplinas() {
  return (
    <section id="producto" style={{ padding: 'clamp(64px,8vw,100px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', textAlign: 'center', marginBottom: 'clamp(36px,5vw,52px)' }}>
        <Eyebrow>Para cualquier disciplina</Eyebrow>
        <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.05, letterSpacing: '-.04em', margin: '0 auto 14px', maxWidth: 720 }}>Pilates, yoga, boxeo, EMS… cada estudio, a tu manera.</h2></Reveal>
        <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: '0 auto', maxWidth: 560 }}>Da igual qué impartas: Tentare se adapta a tus clases, tus salas y tu forma de cobrar.</p></Reveal>
      </div>
      <Reveal delay={100} style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
        {DISCIPLINAS.map((d) => (
          <div
            key={d.label}
            className="tnt-disc-card"
            style={{ position: 'relative', flexShrink: 0, width: 184, aspectRatio: '3/4', borderRadius: 18, overflow: 'hidden', boxShadow: '0 14px 28px -14px rgba(26,26,26,.28)', background: '#E9E9E2' }}
          >
            <Image src={d.photo} alt={d.label} fill sizes="184px" style={{ objectFit: 'cover' }} />
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.94)', padding: '6px 12px 6px 8px', borderRadius: 999, boxShadow: '0 4px 12px rgba(0,0,0,.14)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{d.label}</span>
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
