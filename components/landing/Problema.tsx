import { CARD_DARK, DARK, MUTED_DARK } from './theme';
import { Reveal } from './Reveal';

const MESSAGES = [
  { me: false, text: 'Chicas, mañana no puedo dar el Reformer de las 19h 😣' },
  { me: false, text: '¿Alguien puede? Es urgente' },
  { me: true, text: 'Yo estoy con mis hijas 🙈' },
  { me: false, text: 'Uy yo libro justo ese día' },
  { me: true, text: '¿Y las alumnas ya reservadas? 😰' },
];

export function Problema() {
  return (
    <section id="problema" style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
      <div className="tnt-wrap tnt-g2" style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'center' }}>
        <Reveal>
          <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 18 }}>El problema</div>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 22px' }}>Tu estudio no cabe en cinco apps y un cuaderno.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 440, margin: '0 0 18px' }}>
            Reservas en una, cobros en otra, el calendario en un grupo de WhatsApp, las horas en una hoja de cálculo. Y cuando una instructora avisa de que no puede — a las 22:47 — empieza el caos: llamar una por una, cuadrar, avisar a las alumnas.
          </p>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 440, margin: 0 }}>
            Si no encuentras a nadie, la clase se cae. Y las alumnas se acuerdan.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div style={{ maxWidth: 340, margin: '0 auto', background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 26, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2z" /></svg>
              </span>
              <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Equipo del estudio</div><div className="lp-mono" style={{ fontSize: 10.5, color: '#8E8E86' }}>8 personas · en línea</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {MESSAGES.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.me ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: m.me ? '#3A2E52' : '#242424',
                    color: m.me ? '#E8DEF6' : '#E8E8E4',
                    fontSize: 13,
                    lineHeight: 1.4,
                    padding: '9px 12px',
                    borderRadius: m.me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    animation: `lp-msgIn .5s ease ${i * 0.1}s both`,
                  }}
                >
                  {m.text}
                </div>
              ))}
              <div className="lp-mono" style={{ alignSelf: 'center', fontSize: 10, color: '#6E6E68', marginTop: 2 }}>escribiendo…</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
