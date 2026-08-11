import Link from 'next/link';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureStructuredData } from './FeatureStructuredData';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';

// Armazón compartido de /funcionalidades/<slug>. Da lo que TIENE que ser igual
// en todas —navegación, miga de pan, JSON-LD, relacionadas, pie— y deja libre
// lo que no debe serlo.
//
// El `visual` del encabezado es un hueco a propósito: cada página mete ahí su
// propio dibujo (el motor de sustituciones, el flujo de una factura, la rejilla
// de reformers…). Sin eso, catorce páginas con el mismo hero se leen como una
// plantilla rellenada — que es exactamente lo que no queremos que parezcan.

export function FeatureShell({
  path,
  eyebrow,
  h1,
  intro,
  chips,
  gradient,
  visual,
  children,
}: {
  /** Path en lib/seo/paginas.ts. De ahí salen miga de pan, JSON-LD y relacionadas. */
  path: string;
  eyebrow: string;
  h1: React.ReactNode;
  intro: React.ReactNode;
  /** 2-4 etiquetas cortas con lo concreto que hace. Nada de adjetivos. */
  chips: string[];
  gradient: string;
  visual?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pagina = paginaDe(path);
  const relacionadas = relacionadasDe(path);

  return (
    <PageShell>
      <OrganizationStructuredData />
      <FeatureStructuredData path={path} />
      <SiteNav backHref="/funcionalidades" backLabel="Funcionalidades" />

      <header style={{ position: 'relative', background: gradient, color: '#fff', overflow: 'hidden', padding: 'clamp(30px,4vw,44px) clamp(20px,4vw,44px) clamp(44px,6vw,68px)' }}>
        <div style={{ position: 'absolute', top: '-26%', right: '-8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.13), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto' }}>
          {/* Miga de pan visible, no solo en JSON-LD: es navegación real hacia
              el hub y hacia la home, no un adorno para el rastreador. */}
          <nav aria-label="Ruta" className="lp-mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, letterSpacing: '.06em', color: 'rgba(255,255,255,.6)', marginBottom: 'clamp(24px,4vw,38px)', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,.72)' }}>Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/funcionalidades" style={{ color: 'rgba(255,255,255,.72)' }}>Funcionalidades</Link>
            <span aria-hidden>/</span>
            <span style={{ color: '#fff' }}>{pagina?.etiqueta ?? ''}</span>
          </nav>

          <div className="feat-hero">
            <div>
              <div className="lp-mono" style={{ display: 'inline-flex', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#D9C29E', background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.14)', padding: '7px 14px', borderRadius: 999, marginBottom: 22 }}>{eyebrow}</div>
              <h1 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.6vw,54px)', lineHeight: 1.03, letterSpacing: '-.035em', margin: '0 0 20px', maxWidth: '15ch' }}>{h1}</h1>
              <p style={{ fontSize: 'clamp(16.5px,1.5vw,19.5px)', lineHeight: 1.55, color: 'rgba(255,255,255,.82)', maxWidth: 520, margin: '0 0 26px' }}>{intro}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
                {chips.map((c) => (
                  <span key={c} className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.02em', color: 'rgba(255,255,255,.8)', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.13)', padding: '7px 13px', borderRadius: 8 }}>{c}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href="/crear-estudio" className="hover:brightness-110" style={{ fontSize: 15.5, fontWeight: 700, color: ACC, background: '#D9C29E', padding: '14px 26px', borderRadius: 999, boxShadow: '0 14px 30px rgba(217,194,158,.24)' }}>
                  Crear mi estudio
                </Link>
                <Link href="/precios" style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.86)', padding: '14px 10px' }}>Ver precios →</Link>
              </div>
            </div>
            {visual && <div className="feat-hero-visual">{visual}</div>}
          </div>
        </div>
      </header>

      <div style={{ padding: 'clamp(40px,6vw,68px) clamp(20px,4vw,44px) clamp(20px,3vw,32px)' }}>
        <article className="feat-body">{children}</article>
      </div>

      {relacionadas.length > 0 && (
        <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(56px,7vw,88px)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A8A89F', margin: '0 0 16px' }}>Sigue por aquí</h2>
            <div className="feat-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="feat-rel-card" style={{ display: 'block', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '20px 22px', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.25, marginBottom: 7 }}>{r.etiqueta}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{r.resumen ?? r.descripcion}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .feat-hero { display: grid; grid-template-columns: 1.02fr .98fr; gap: clamp(28px,4vw,52px); align-items: center; }
        .feat-body { max-width: 820px; margin: 0 auto; }
        .feat-body > section { margin-bottom: clamp(44px,6vw,72px); }
        .feat-body h2 { font-weight: 800; font-size: clamp(25px,3.1vw,34px); line-height: 1.1; letter-spacing: -.032em; margin: 0 0 14px; scroll-margin-top: 88px; }
        .feat-body h3 { font-weight: 700; font-size: 18.5px; letter-spacing: -.012em; margin: 26px 0 8px; }
        .feat-body p { font-size: 17px; line-height: 1.66; color: #3A3A34; margin: 0 0 17px; }
        .feat-body p:last-child { margin-bottom: 0; }
        .feat-body strong { color: #1A1A1A; font-weight: 700; }
        .feat-body a { color: ${ACC}; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
        .feat-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feat-rel-card { transition: transform .22s cubic-bezier(.2,.7,0,1), box-shadow .22s; }
        .feat-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        @media (max-width: 940px) {
          .feat-hero { grid-template-columns: 1fr; }
          .feat-hero-visual { order: -1; }
          .feat-rel { grid-template-columns: 1fr; }
        }
      `}</style>
    </PageShell>
  );
}
