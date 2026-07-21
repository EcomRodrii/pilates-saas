import type { Metadata } from 'next';
import {
  LogoWordmark, LogoMark, Eyebrow, GradientText, BrandButton, BrandLink,
  Halo, Card, DeviceFrame, Reveal,
} from '@/components/marketing/brand';

// Styleguide interno del sistema de marca de marketing (Fase 1). No es una
// página de cliente: es la referencia viva del sistema teal→magenta cálido con
// la que se construyen las fases siguientes. noindex — no debe posicionar.
export const metadata: Metadata = {
  title: 'Sistema de marca · Tentare',
  robots: { index: false, follow: false },
};

const SWATCHES = [
  { nm: 'Teal', hx: '#12A6B4' },
  { nm: 'Violeta', hx: '#7C4BA0' },
  { nm: 'Magenta', hx: '#D74A93' },
  { nm: 'Tinta cálida', hx: '#1B141F' },
  { nm: 'Blanco cálido', hx: '#FCFBF9' },
];

export default function MarcaPage() {
  return (
    <div className="tentare-mkt" style={{ background: 'var(--mkt-paper)', minHeight: '100vh' }}>
      {/* NAV */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '16px 30px',
          background: 'color-mix(in srgb, var(--mkt-paper) 84%, transparent)',
          backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--mkt-line)',
        }}
      >
        <LogoWordmark />
        <BrandButton href="/crear-estudio" size="sm">Prueba gratis</BrandButton>
      </nav>

      {/* HERO de composición (referencia) */}
      <header style={{ position: 'relative', padding: '82px 0 58px' }}>
        <Halo style={{ top: -200, right: -150, width: 680, height: 680 }} />
        <div
          className="mkt-container"
          style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1.02fr 1.05fr', gap: 54, alignItems: 'center' }}
        >
          <div>
            <Reveal><Eyebrow style={{ marginBottom: 24 }}>Software 100&nbsp;% Pilates · Hecho en España</Eyebrow></Reveal>
            <Reveal delay={0.08}>
              <h1 style={{ fontSize: 'clamp(39px,5.5vw,64px)', fontWeight: 800, lineHeight: 1.01, letterSpacing: '-0.037em', margin: '0 0 24px', textWrap: 'balance' }}>
                El estudio sigue en marcha,<br /><GradientText>aunque tú desconectes.</GradientText>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p style={{ fontSize: 'clamp(16.5px,1.6vw,19px)', color: 'var(--mkt-muted)', maxWidth: '30em', margin: '0 0 32px' }}>
                Reservas, cobros y reactivación de socias en piloto automático que tú supervisas de un toque. Solo para Pilates, con{' '}
                <b style={{ color: 'var(--mkt-text)' }}>facturación española</b> y <b style={{ color: 'var(--mkt-text)' }}>0&nbsp;% de comisión</b> sobre tus cobros.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <BrandButton href="/crear-estudio">Prueba gratis →</BrandButton>
                <BrandButton href="#" variant="ghost">▷ Ver demo</BrandButton>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.16} style={{ position: 'relative' }}>
            <DeviceFrame>
              <div style={{ padding: 17, color: '#EEEAEC' }}>
                <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)' }}>Lunes, 21 de julio</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 14 }}>Centro de Control</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderRadius: 13, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)', marginBottom: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--mkt-grad)', display: 'grid', placeItems: 'center', color: '#fff', flex: 'none' }}>✦</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>Piloto automático · activo</div>
                    <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 10, color: 'rgba(255,255,255,.5)' }}>9 acciones ejecutadas hoy</div>
                  </div>
                  <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--mkt-teal)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--mkt-teal) 24%, transparent)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
                  {[['Ingresos mes', '8.940€', '▲ 12%'], ['Ocupación', '87%', '▲ 5%'], ['Reservas hoy', '64', '8 clases']].map(([k, v, d]) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 13, padding: 12 }}>
                      <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 8.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.42)' }}>{k}</div>
                      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: d.startsWith('▲') ? '#67C79E' : 'rgba(255,255,255,.4)' }}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </DeviceFrame>
          </Reveal>
        </div>
      </header>

      {/* SISTEMA (banda oscura) */}
      <section className="mkt-band" style={{ padding: '88px 0', marginTop: 40 }}>
        <div className="mkt-container">
          <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--mkt-band-muted)', marginBottom: 15 }}>El sistema</div>
          <h2 style={{ fontSize: 'clamp(28px,3.6vw,41px)', fontWeight: 800, letterSpacing: '-0.037em', margin: '0 0 40px', textWrap: 'balance' }}>
            Una sola marca, del logo a la última pantalla.
          </h2>

          <div style={{ height: 82, borderRadius: 16, background: 'var(--mkt-grad)', marginBottom: 12, boxShadow: 'var(--mkt-shadow)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 46 }}>
            {SWATCHES.map(s => (
              <div key={s.nm} style={{ borderRadius: 13, overflow: 'hidden', border: '1px solid rgba(255,255,255,.09)' }}>
                <div style={{ height: 64, background: s.hx, border: s.hx === '#FCFBF9' ? '1px solid rgba(255,255,255,.1)' : undefined }} />
                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.nm}</div>
                  <div style={{ fontFamily: 'var(--mkt-mono)', fontSize: 11, color: 'var(--mkt-band-muted)' }}>{s.hx}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
            <LogoMark size={40} />
            <Eyebrow style={{ color: 'var(--mkt-band-muted)' }}>Eyebrow</Eyebrow>
            <BrandButton href="#">Prueba gratis</BrandButton>
            <BrandButton href="#" variant="ghost" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.18)' }}>Ver demo</BrandButton>
            <BrandLink href="#">Enlace de marca</BrandLink>
          </div>
        </div>
      </section>

      {/* Tarjeta clara de ejemplo */}
      <section style={{ padding: '64px 0 100px' }}>
        <div className="mkt-container">
          <Card style={{ padding: 28, maxWidth: 420 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>Cobros sin comisión</div>
            <div style={{ fontSize: 14, color: 'var(--mkt-muted)' }}>El dinero de tus socias va directo a tu cuenta de Stripe. Tentare no toca ni un céntimo.</div>
          </Card>
        </div>
      </section>
    </div>
  );
}
