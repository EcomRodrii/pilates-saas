import { MUTED } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { INTEGRACIONES } from './data';
import { IntegracionLogo } from './integracion-logos';

export function Integraciones() {
  return (
    <section style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ maxWidth: 700, marginBottom: 44 }}>
          <Eyebrow>Integraciones</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>Se conecta con lo que ya usas.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>No tienes que tirar tus herramientas. Tentare se conecta con las que usas para cobrar, comunicar y organizar tu estudio — y añadimos nuevas cada mes.</p></Reveal>
        </div>
        <Reveal delay={60} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {INTEGRACIONES.map((g) => (
            <div key={g.group}>
              <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 12 }}>{g.group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                {g.items.map((it) => (
                  <span key={it} className="tnt-ichip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#1A1A1A', background: '#fff', border: it.startsWith('+') ? '1px dashed #E7E7E0' : '1px solid #E7E7E0', borderRadius: 999, padding: '10px 18px', whiteSpace: 'nowrap', opacity: it.startsWith('+') ? 0.7 : 1 }}>
                    <IntegracionLogo item={it} />
                    {it}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
