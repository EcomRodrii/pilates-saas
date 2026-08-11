import Link from 'next/link';
import { ACC, DARK, MUTED } from './theme';
import { Eyebrow, Reveal } from './Reveal';
import { PLANS } from './data';

export function Precio() {
  return (
    <section id="precio" style={{ background: '#F3F3EF', borderTop: '1px solid #E7E7E0', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
      <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow>Precio</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 12px' }}>Un software completo. Un solo precio.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, color: MUTED, margin: 0 }}>Sustituciones incluidas desde el primer plan. Sin comisión sobre tus cobros. Cancela cuando quieras.</p></Reveal>
        </div>
        <div className="tnt-pricing" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'stretch' }}>
          {PLANS.map((plan, i) => (
            <Reveal
              key={plan.name}
              delay={i * 90}
              className="tnt-lift"
              style={{
                background: plan.dark ? DARK : '#fff',
                color: plan.dark ? '#E8E8E4' : undefined,
                border: plan.dark ? 'none' : '1px solid #E7E7E0',
                borderRadius: 24,
                padding: 34,
                position: 'relative',
                boxShadow: plan.dark ? '0 30px 60px -22px rgba(26,26,26,.45)' : undefined,
              }}
            >
              {plan.popular && (
                <div className="lp-mono" style={{ position: 'absolute', top: -12, left: 34, background: ACC, color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '6px 13px', borderRadius: 999 }}>POPULAR</div>
              )}
              <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: plan.dark ? '#A8B080' : '#8E8E86', marginBottom: 14 }}>{plan.name}</div>
              <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em', color: plan.dark ? '#fff' : undefined }}>{plan.price}<span style={{ fontSize: 16, fontWeight: 500, color: '#8E8E86' }}>/mes</span></div>
              <p style={{ fontSize: 14, color: plan.dark ? '#8E8E86' : MUTED, margin: '6px 0 22px' }}>{plan.desc}</p>
              <div style={{ borderTop: plan.dark ? '1px solid rgba(255,255,255,.08)' : '1px solid #EDEDE6', paddingTop: 18, fontSize: 14.5, color: plan.dark ? '#D8D8D2' : MUTED, lineHeight: 2 }}>
                {plan.features.map((f, fi) => <span key={f}>{f}{fi < plan.features.length - 1 && <br />}</span>)}
              </div>
              <Link
                href="/crear-estudio"
                className="block hover:brightness-95 transition-all"
                style={{ textAlign: 'center', marginTop: 24, background: plan.popular ? ACC : '#F3F3EF', color: plan.popular ? '#fff' : '#1A1A1A', fontWeight: 700, padding: 14, borderRadius: 14 }}
              >
                {plan.cta}
              </Link>
            </Reveal>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          {/* El bloque de precios se queda en la landing porque convierte; el
              detalle (comparativa plan a plan, límites, qué se paga aparte y
              FAQ de precio) vive en /precios, que es la URL que puede
              posicionar por esa consulta. */}
          <Link href="/precios" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: ACC }}>
            Comparar los planes en detalle
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </Link>
          <p className="lp-mono" style={{ fontSize: 11, color: '#A8A89F', marginTop: 18 }}>Sin permanencia · Migración incluida · Pagos vía Stripe, sin comisión extra de Tentare</p>
        </div>
      </div>
    </section>
  );
}
