import type { Metadata } from 'next';
import { ACC, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';

export const metadata: Metadata = {
  title: 'Comparativa: Tentare vs bsport, Mindbody y Eversports',
  description: 'Compara Tentare con el software de gestión tradicional para estudios de Pilates en España: facturación Veri*factu, precio público, permanencia, datos en la UE y sustitución de instructoras.',
  alternates: { canonical: 'https://tentare.app/comparativa' },
  openGraph: {
    type: 'website',
    title: 'Comparativa: Tentare vs bsport, Mindbody y Eversports',
    description: 'Las diferencias que se notan cada día y cada fin de mes en un estudio de Pilates en España.',
    url: 'https://tentare.app/comparativa',
  },
};

type Verdict = 'yes' | 'no' | 'partial';

function Mark({ v, label }: { v: Verdict; label: string }) {
  const color = v === 'yes' ? '#4E9E7F' : v === 'no' ? '#C2503A' : '#C79A2E';
  const symbol = v === 'yes' ? '✓' : v === 'no' ? '✗' : '≈';
  return <><span style={{ color, fontWeight: 800 }}>{symbol}</span> {label}</>;
}

const ROWS: { feature: string; tentare: [Verdict, string]; bsport: [Verdict, string]; mindbody: [Verdict, string]; eversports: [Verdict, string] }[] = [
  { feature: 'Facturación España (Veri*factu) nativa', tentare: ['yes', 'Nativo'], bsport: ['no', 'Vía ERP externo'], mindbody: ['no', 'No'], eversports: ['partial', 'Add-on de pago'] },
  { feature: 'Precios públicos', tentare: ['yes', 'Desde 29€'], bsport: ['no', 'A demanda'], mindbody: ['no', 'A demanda'], eversports: ['yes', 'Público'] },
  { feature: 'Sin permanencia', tentare: ['yes', 'Sí'], bsport: ['no', 'Contrato anual'], mindbody: ['no', '12-24 meses'], eversports: ['no', 'Anual'] },
  { feature: 'Datos alojados en la UE', tentare: ['yes', 'Sí'], bsport: ['yes', 'Sí'], mindbody: ['no', 'EE. UU.'], eversports: ['yes', 'Sí'] },
  { feature: 'Sin comisión por captar clientas', tentare: ['yes', 'Sin marketplace'], bsport: ['yes', 'Sin marketplace'], mindbody: ['no', '~20%'], eversports: ['no', '~25%'] },
  { feature: 'Sustitución de instructoras integrada', tentare: ['yes', 'Con niveles de autonomía'], bsport: ['yes', 'Herramientas'], mindbody: ['partial', 'Limitado'], eversports: ['partial', 'Limitado'] },
  { feature: 'Aviso de dependencia de una instructora', tentare: ['yes', 'Riesgo de plantón'], bsport: ['no', 'No'], mindbody: ['no', 'No'], eversports: ['no', 'No'] },
];

export default function ComparativaPage() {
  return (
    <PageShell>
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(124,58,237,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5B21B6', background: '#F1ECFB', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Comparativa</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Tentare frente a bsport, Mindbody y Eversports.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>No somos mejores en todo — y te lo contamos abajo, sin rodeos. Pero para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, hay diferencias que se notan cada día y cada fin de mes.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 60px -44px rgba(26,26,26,.3)' }}>
            <div className="cmp-hint lp-mono" style={{ display: 'none', alignItems: 'center', gap: 7, padding: '12px 16px 0', fontSize: 11, color: '#A8A89F' }}>
              Desliza la tabla para ver todo
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 11, fontWeight: 600, color: '#8E8E86', textTransform: 'uppercase', letterSpacing: '.06em', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0', minWidth: 210 }}>Para tu estudio</th>
                    <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 13, fontWeight: 800, color: '#fff', background: ACC, borderBottom: `1px solid ${ACC}` }}>Tentare</th>
                    <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>bsport</th>
                    <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>Mindbody</th>
                    <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>Eversports</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={r.feature}>
                      <td style={{ padding: '15px 20px', fontSize: 14, fontWeight: 600, borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}>{r.feature}</td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#1A1A1A', background: '#FAF7FE', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.tentare[0]} label={r.tentare[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#8E8E86', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.bsport[0]} label={r.bsport[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#8E8E86', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.mindbody[0]} label={r.mindbody[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#8E8E86', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.eversports[0]} label={r.eversports[1]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <p className="lp-mono" style={{ fontSize: 11, color: '#A8A89F', margin: '16px 4px 0', lineHeight: 1.6 }}>Basado en información pública de cada proveedor a mediados de 2026. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. bsport, Mindbody y Eversports son marcas de sus respectivos propietarios; esta comparación es orientativa y sin ánimo de menoscabo.</p>
        </div>
      </section>

      <section style={{ background: '#0F0F0F', color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 16 }}>Con honestidad</Reveal>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.8vw,42px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 28px', color: '#fff' }}>En qué aún no somos los mejores.</h2></Reveal>
          <div className="cmp-two">
            <Reveal style={{ background: '#171717', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>App nativa para tus alumnas</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Hoy tus alumnas usan un portal web (funciona en cualquier móvil, sin instalar). bsport, Momence o Mindbody tienen app nativa de marca; la nuestra está en el camino.</p>
            </Reveal>
            <Reveal delay={90} style={{ background: '#171717', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Un marketplace que te traiga clientas</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Mindbody y Eversports tienen su propio directorio de captación. Nosotros no — a cambio, no te cobramos comisión por cada alumna nueva.</p>
            </Reveal>
          </div>
          <Reveal><p style={{ fontSize: 15, lineHeight: 1.6, color: '#8E8E86', margin: '24px 0 0' }}>Preferimos decírtelo antes de que lo descubras. Si algo de esto es imprescindible para ti hoy, te lo diremos en la demo — sin venderte humo.</p></Reveal>
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Compruébalo con tu propio estudio." body="Migramos tus datos por ti. Sin permanencia. Sin sorpresas." />
        </div>
      </section>

      <SiteFooter links={[{ href: '/seguridad', label: 'Seguridad' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .cmp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 760px) {
          .cmp-two { grid-template-columns: 1fr; }
          .cmp-hint { display: flex !important; }
        }
      `}</style>
    </PageShell>
  );
}
