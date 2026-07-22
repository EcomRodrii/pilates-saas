import { ACC, ACC_SOFT, BG, DARK, MUTED } from './theme';
import { Eyebrow, LiftCard, Reveal } from './Reveal';
import { IconAlert, IconCheck, IconUsers } from './icons';
import { CENTRO_CARDS } from './data';

export function CentroDeControl() {
  return (
    <section id="centro-de-control" style={{ background: '#F3F3EF', borderTop: '1px solid #E7E7E0', borderBottom: '1px solid #E7E7E0', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ maxWidth: 720, marginBottom: 'clamp(40px,6vw,58px)' }}>
          <Eyebrow>Centro de Control</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>El cerebro de tu estudio.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>No es una pantalla más. Es el sistema que revisa tu estudio cada mañana, detecta lo que necesita tu atención y te lo deja listo para aprobar. Tú decides; él ejecuta. <span style={{ color: '#A8A89F' }}>(Ejemplo con datos ficticios.)</span></p></Reveal>
        </div>

        <Reveal delay={120} style={{ maxWidth: 1000, margin: '0 auto' }}>
          <LiftCard style={{ background: BG, border: '1px solid #E1E1D9', borderRadius: 20, overflow: 'hidden', boxShadow: '0 44px 90px -40px rgba(26,26,26,.34)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#D8C3E0' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
              <span className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#A8A89F' }}>tentare.app/centro-de-control</span>
            </div>
            <div style={{ padding: 'clamp(16px,3vw,26px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86' }}>Martes, 8 de julio</span>
                <span className="lp-mono" style={{ fontSize: 12, color: MUTED, border: '1px solid #E1E1D9', background: '#fff', borderRadius: 999, padding: '6px 13px' }}>Analizar ahora</span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.25, maxWidth: '74%' }}>Buenos días, Marta. Tu estudio va bien — hay 2 cosas que mirar.</div>
                  <span className="lp-mono" style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#D97706', background: '#FFFBEB', borderRadius: 999, padding: '5px 11px' }}>Atención</span>
                </div>
                <div style={{ display: 'flex', gap: 22, marginTop: 12, fontSize: 12.5, color: '#8E8E86', flexWrap: 'wrap' }}>
                  <span>Tiempo estimado <strong style={{ color: '#1A1A1A' }}>6 min</strong></span>
                  <span>Impacto económico <strong style={{ color: '#1A1A1A' }}>+240€/mes</strong></span>
                </div>
              </div>
              <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#A8A89F' }}>Prioridades</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="tnt-g2">
                <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: '#FBEDE8', color: '#C2503A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconAlert(14)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Baja de instructora sin cubrir</span>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED, margin: '0 0 12px' }}>Marta no puede el jueves 19:00. 3 candidatas disponibles y ya avisadas.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ flex: 1, textAlign: 'center', background: ACC, color: '#fff', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10 }}>Aprobar sustituta</span>
                    <span style={{ textAlign: 'center', background: '#F3F3EF', color: MUTED, fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 10 }}>Rechazar</span>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconUsers(14)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Socia en riesgo de fuga</span>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED, margin: '0 0 12px' }}>Nora no reserva desde hace 3 semanas. Sugerimos un mensaje de reactivación.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ flex: 1, textAlign: 'center', background: ACC, color: '#fff', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10 }}>Aprobar y enviar</span>
                    <span style={{ textAlign: 'center', background: '#F3F3EF', color: MUTED, fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 10 }}>Rechazar</span>
                  </div>
                </div>
              </div>
              <div style={{ background: DARK, color: '#D8D8D2', borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C08BE8' }}>Mientras dormías</span>
                <span style={{ fontSize: 13 }}>2 reservas nuevas · 1 bono renovado · 1 pago reintentado con éxito</span>
              </div>
            </div>
          </LiftCard>
        </Reveal>

        <div className="tnt-g3" style={{ marginTop: 'clamp(34px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {CENTRO_CARDS.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 70}>
              <LiftCard style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 18, padding: 22, height: '100%' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{IconCheck(19)}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 6px' }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, margin: 0 }}>{c.body}</p>
              </LiftCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
