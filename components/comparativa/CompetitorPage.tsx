import { ACC, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ComparativaBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { LogoTentare } from '@/components/marca/logo-tentare';

export type Verdict = 'yes' | 'no' | 'partial';

function Mark({ v, label }: { v: Verdict; label: string }) {
  const color = v === 'yes' ? '#4E9E7F' : v === 'no' ? '#C2503A' : '#C79A2E';
  const symbol = v === 'yes' ? '✓' : v === 'no' ? '✗' : '≈';
  return <><span style={{ color, fontWeight: 800 }}>{symbol}</span> {label}</>;
}

export type ComparativaRow = { feature: string; tentare: [Verdict, string]; them: [Verdict, string] };
export type HonestyCard = { title: string; body: string };

// Página 1-vs-1 en /comparativa/tentare-vs-X. Comparte estructura y estilos con
// app/comparativa/page.tsx (la tabla general), pero enfrenta el logo real de
// cada competidor al nuestro — logos descargados de la propia web pública de
// cada proveedor (public/comparativa/logos/), no un placeholder de IA.
export function CompetitorPage({
  name,
  slug,
  logo,
  h1,
  intro,
  rows,
  honestyIntro,
  honesty,
  footnote,
  ctaBody = 'Migramos tus datos por ti. Sin permanencia. Sin sorpresas.',
}: {
  name: string;
  slug: string;
  logo: { src: string; alt: string; height: number; width: number; cardBg?: string };
  h1: React.ReactNode;
  intro: React.ReactNode;
  rows: ComparativaRow[];
  honestyIntro: string;
  honesty: HonestyCard[];
  footnote: string;
  ctaBody?: string;
}) {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <ComparativaBreadcrumb slug={slug} name={`Tentare vs ${name}`} />
      <SiteNav backHref="/comparativa" backLabel="Toda la comparativa" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26 }}>
            <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', boxShadow: '0 14px 30px -18px rgba(26,26,26,.22)' }}>
              <LogoTentare formato="horizontal" alto={22} />
            </div>
            <span className="lp-mono" style={{ fontSize: 13, color: '#A8A89F' }}>vs</span>
            <div style={{ background: logo.cardBg ?? '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', boxShadow: '0 14px 30px -18px rgba(26,26,26,.22)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.src} alt={logo.alt} height={logo.height} width={logo.width} style={{ height: logo.height, width: 'auto', maxWidth: 160, display: 'block' }} />
            </div>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>{h1}</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>{intro}</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 60px -44px rgba(26,26,26,.3)' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 11, fontWeight: 600, color: '#8E8E86', textTransform: 'uppercase', letterSpacing: '.06em', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>Para tu estudio</th>
                  <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 13, fontWeight: 800, color: '#fff', background: ACC, borderBottom: `1px solid ${ACC}` }}>Tentare</th>
                  <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>{name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.feature}>
                    <td style={{ padding: '15px 20px', fontSize: 14, fontWeight: 600, borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}>{r.feature}</td>
                    <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#1A1A1A', background: '#F7F8F1', borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.tentare[0]} label={r.tentare[1]} /></td>
                    <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#8E8E86', borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.them[0]} label={r.them[1]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <p className="lp-mono" style={{ fontSize: 11, color: '#A8A89F', margin: '16px 4px 0', lineHeight: 1.6 }}>{footnote}</p>
        </div>
      </section>

      <section style={{ background: '#0F0F0F', color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 16 }}>Con honestidad</Reveal>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.8vw,42px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 16px', color: '#fff' }}>En qué {name} aún nos gana.</h2></Reveal>
          <Reveal delay={100}><p style={{ fontSize: 15.5, lineHeight: 1.6, color: MUTED_DARK, margin: '0 0 28px', maxWidth: 640 }}>{honestyIntro}</p></Reveal>
          <div className="cmp1-two">
            {honesty.map((h, i) => (
              <Reveal key={h.title} delay={90 + i * 40} style={{ background: '#171717', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{h.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>{h.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Compruébalo con tu propio estudio." body={ctaBody} />
        </div>
      </section>

      <SiteFooter links={[{ href: '/comparativa', label: 'Comparativa' }, { href: '/seguridad', label: 'Seguridad' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .cmp1-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 760px) { .cmp1-two { grid-template-columns: 1fr; } }
      `}</style>
    </PageShell>
  );
}
