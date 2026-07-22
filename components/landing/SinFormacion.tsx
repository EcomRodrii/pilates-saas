import { CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Reveal } from './Reveal';
import { IconCheck } from './icons';

const CARDS = [
  { title: 'El sistema te dice qué hacer', body: 'El Centro de Control te pone delante lo que necesita tu atención. No buscas nada entre menús: llega solo.', color: '#C08BE8' },
  { title: 'Empieza hoy, aprende sobre la marcha', body: 'Activas lo básico primero y el resto cuando te haga falta. Sin cursos ni configuraciones eternas.', color: '#7BD3A8' },
  { title: 'Migración incluida', body: 'Importas tus datos con asistentes guiados por CSV y te acompañamos en la puesta en marcha. No empiezas de cero ni te dejamos sola.', color: '#C08BE8' },
];

export function SinFormacion() {
  return (
    <section style={{ padding: 'clamp(56px,7vw,96px) clamp(20px,4vw,44px)' }}>
      <Reveal style={{ maxWidth: 1280, margin: '0 auto', background: DARK, color: '#E8E8E4', borderRadius: 28, padding: 'clamp(32px,5vw,60px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.28), transparent 64%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ maxWidth: 640, marginBottom: 'clamp(28px,4vw,40px)' }}>
            <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 14 }}>Sin curva de aprendizaje</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.2vw,48px)', lineHeight: 1.03, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>Hecho para usarlo sin manual.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>No necesitas formación ni un técnico. Tentare está pensado para que una propietaria ocupada lo maneje desde el primer día. Si sabes usar WhatsApp, sabes usar Tentare.</p>
          </div>
          <div className="tnt-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {CARDS.map((c) => (
              <div key={c.title} style={{ background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{IconCheck(20)}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
