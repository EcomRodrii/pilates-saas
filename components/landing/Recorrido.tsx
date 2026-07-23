import Image from 'next/image';
import { ACC, ACC_SOFT, BG, DARK, MUTED } from './theme';
import { Avatar, Chip, Eyebrow, LiftCard, Reveal } from './Reveal';
import { IconCalendar, IconCheck, IconInvoice } from './icons';
import { RECORRIDO_ITEMS } from './data';

export function Recorrido() {
  return (
    <section id="recorrido" style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ maxWidth: 680, marginBottom: 'clamp(48px,7vw,84px)' }}>
          <Eyebrow>La plataforma, módulo a módulo</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>Cada pieza de tu estudio, ya conectada.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>De la reserva a la factura, pasando por el calendario y tu equipo — sin saltar entre apps ni duplicar datos.</p></Reveal>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(56px,8vw,90px)' }}>
          {RECORRIDO_ITEMS.map((item, i) => {
            const alt = i % 2 === 1;
            return (
              <div key={item.n} className="tnt-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px,5vw,68px)', alignItems: 'center' }}>
                <Reveal style={{ order: alt ? 2 : 1 }}>
                  <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 12 }}>{item.n} · {item.eyebrow}</div>
                  <h3 style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, margin: '0 0 12px' }}>{item.title}</h3>
                  <p style={{ fontSize: 16.5, lineHeight: 1.6, color: MUTED, margin: '0 0 18px', maxWidth: 440 }}>{item.body}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {item.chips.map((c) => <Chip key={c}>{c}</Chip>)}
                  </div>
                </Reveal>
                <Reveal delay={120} from={alt ? 'left' : 'right'} style={{ order: alt ? 1 : 2 }}>
                  <RecorridoVisual index={i} />
                </Reveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Recorrido visual mockups ───────────────────────────────────────────────

function RecorridoVisual({ index }: { index: number }) {
  const base: React.CSSProperties = { background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, padding: 20, boxShadow: '0 34px 70px -34px rgba(26,26,26,.28)', maxWidth: 440, margin: '0 auto' };

  if (index === 0) {
    return (
      <LiftCard style={base}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Reformer Flow</div>
          <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Hoy · 19:00 · Sala 1</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex' }}>
            {['#D8C3E0', '#A8C7CE', ACC_SOFT].map((c, i) => (
              <span key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: '2px solid #fff', marginLeft: i ? -9 : 0 }} />
            ))}
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#EDEDE6', border: '2px solid #fff', marginLeft: -9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#8E8E86' }}>+5</span>
          </div>
          <span className="lp-mono" style={{ fontSize: 12, color: '#4E9E7F', marginLeft: 'auto' }}>8/10 plazas</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: '#EDEDE6', overflow: 'hidden', marginBottom: 16 }}><div style={{ height: '100%', width: '80%', background: ACC, borderRadius: 99 }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F1', borderRadius: 12, padding: '11px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{IconCalendar(12)}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Lista de espera</span>
          </div>
          <span className="lp-mono" style={{ fontSize: 11.5, color: '#8E8E86' }}>2 en espera</span>
        </div>
        <div style={{ textAlign: 'center', background: ACC, color: '#fff', fontSize: 14, fontWeight: 700, padding: 12, borderRadius: 12 }}>Reservar</div>
      </LiftCard>
    );
  }
  if (index === 1) {
    return (
      <LiftCard style={base}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: '#F5F5F1', marginBottom: 8 }}>
          <Avatar label="N" bg="#D8C3E0" />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Nora P.</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Bono 8 · 3 sesiones</div></div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#4E9E7F', background: '#E7F3EC', padding: '5px 9px', borderRadius: 999 }}>Activa</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: '#F5F5F1', marginBottom: 8 }}>
          <Avatar label="C" bg="#A8C7CE" />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Carla M.</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Mensual ilimitado</div></div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#B57A8E', background: '#FBEDE8', padding: '5px 9px', borderRadius: 999 }}>Renovar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: DARK, borderRadius: 14, padding: '11px 14px', marginTop: 12 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.08)', color: '#C08BE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconInvoice(13)}</span>
          <div style={{ fontSize: 12.5, color: '#E8E8E4', flex: 1 }}>&ldquo;Te esperamos mañana en tu Reformer 💜&rdquo;</div>
          <span className="lp-mono" style={{ fontSize: 10, color: '#7BD3A8' }}>Enviado ✓</span>
        </div>
      </LiftCard>
    );
  }
  if (index === 2) {
    const cells = [
      { d: 'LUN' }, { d: 'MAR' }, { d: 'MIÉ' }, { d: 'JUE' },
      { bg: ACC_SOFT, bar: ACC, title: 'Reformer', sub: 'Sala 1' },
      { bg: '#EDF3F4', bar: '#3E7C86', title: 'Mat', sub: 'Sala 2' },
      { bg: '#F5F5F1' },
      { bg: ACC_SOFT, bar: ACC, title: 'Reformer', sub: 'Sala 1' },
      { bg: '#F3ECF5', bar: '#8B4F9E', title: 'Prenatal', sub: 'Sala 1' },
      { bg: '#F5F5F1' },
      { bg: '#EDF3F4', bar: '#3E7C86', title: 'Mat', sub: 'Sala 2' },
      { bg: '#F5F5F1' },
    ];
    return (
      <LiftCard style={base}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Semana</div>
          <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>30 jun – 5 jul</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
          {cells.map((c, i) =>
            'd' in c ? (
              <div key={i} className="lp-mono" style={{ fontSize: 10, color: '#A8A89F', textAlign: 'center' }}>{c.d}</div>
            ) : c.title ? (
              <div key={i} style={{ background: c.bg, borderLeft: `3px solid ${c.bar}`, borderRadius: 7, padding: '7px 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{c.title}</div>
                <div className="lp-mono" style={{ fontSize: 9, color: '#8E8E86' }}>{c.sub}</div>
              </div>
            ) : (
              <div key={i} style={{ background: c.bg, borderRadius: 7, minHeight: 30 }} />
            )
          )}
        </div>
      </LiftCard>
    );
  }
  if (index === 3) {
    return (
      <LiftCard style={base}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F1', borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#E7F3EC', color: '#4E9E7F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{IconCheck(17)}</span>
            <div><div style={{ fontSize: 14, fontWeight: 700 }}>Bono 10 sesiones</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Carla M. · renovado</div></div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>120€</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', border: '1px solid #EDEDE6', borderRadius: 14, marginBottom: 16 }}>
          <div className="lp-mono" style={{ fontSize: 12, color: MUTED }}>Factura #0042</div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#4E9E7F', background: '#E7F3EC', padding: '5px 9px', borderRadius: 999 }}>Emitida</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div><div className="lp-mono" style={{ fontSize: 10, textTransform: 'uppercase', color: '#A8A89F' }}>Ingresos mes</div><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>8.940€</div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 38 }}>
            {['40%', '60%', '50%', '80%', '100%'].map((h, i) => (
              <span key={i} style={{ width: 8, height: h, background: i === 4 ? ACC : '#E1DAF3', borderRadius: 3 }} />
            ))}
          </div>
        </div>
      </LiftCard>
    );
  }
  if (index === 4) {
    const team = [
      { name: 'Ana', spec: 'Reformer · Mat', hours: '24 h', bg: '#D8C3E0', active: true },
      { name: 'Lucía', spec: 'Mat · Prenatal', hours: '18 h', bg: '#A8C7CE', active: true },
      { name: 'Marta', spec: 'Prenatal', hours: '12 h', bg: ACC_SOFT, active: false },
    ];
    return (
      <LiftCard style={base}>
        {team.map((m, i) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < team.length - 1 ? '1px solid #EDEDE6' : undefined }}>
            <Avatar label={m.name[0]} bg={m.bg} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>{m.spec}</div></div>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.active ? '#4E9E7F' : '#E4C65A' }} />
            <span className="lp-mono" style={{ fontSize: 12, color: MUTED, width: 42, textAlign: 'right' }}>{m.hours}</span>
          </div>
        ))}
      </LiftCard>
    );
  }
  // index === 5 — panel (captura real del producto)
  return (
    <LiftCard style={{ background: BG, border: '1px solid #E1E1D9', borderRadius: 18, overflow: 'hidden', boxShadow: '0 34px 70px -34px rgba(26,26,26,.3)', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#D8C3E0' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
        <span className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#A8A89F' }}>tentare.app</span>
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '2862 / 1360', overflow: 'hidden' }}>
        <Image src="/hero-panel.png" alt="Panel de Tentare" fill sizes="(max-width: 960px) 90vw, 440px" style={{ objectFit: 'cover', objectPosition: 'top', animation: 'lp-kenburns 16s ease-in-out infinite' }} />
      </div>
    </LiftCard>
  );
}
