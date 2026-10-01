import Link from 'next/link';
import { G2_NOTA, G2_URL } from '@/lib/seo/g2';
import { ACC, ACC_SOFT, DARK, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { ComparativaBreadcrumb, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';
import { LEGAL } from '@/lib/legal-info';

export type Verdict = 'yes' | 'no' | 'partial';

function Mark({ v, label }: { v: Verdict; label: string }) {
  const color = v === 'yes' ? '#4E9E7F' : v === 'no' ? '#C2503A' : '#C79A2E';
  const symbol = v === 'yes' ? '✓' : v === 'no' ? '✗' : '≈';
  return <><span style={{ color, fontWeight: 800 }}>{symbol}</span> {label}</>;
}

// La nota pública de G2 (lib/seo/g2.ts): se enseña porque cualquiera puede comprobarla.

/** Lo que distingue a Tentare frente a cualquiera de la lista. Solo cosas que el producto hace hoy. */
const POR_QUE = [
  { titulo: 'Hecho solo para Pilates', texto: 'Plaza por reformer, plazas fijas, bonos y lista de espera pensados para tu estudio, no para un gimnasio.' },
  { titulo: 'Si falla una instructora, Tentare la cubre', texto: 'Busca sustituta, la contacta y avisa a tus alumnas. Sin llamadas ni grupos de WhatsApp.' },
  { titulo: 'Cobras tú, sin comisión', texto: 'Tarjeta y SEPA directos a tu cuenta con Stripe. Tentare no se queda nada de cada cobro.' },
];

export type ComparativaRow ={ feature: string; tentare: [Verdict, string]; them: [Verdict, string] };

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
  veredicto,
  footnote,
  faq,
  ctaBody = 'Te ayudamos a traer tus datos. Sin permanencia. Sin sorpresas.',
}: {
  name: string;
  slug: string;
  logo: { src: string; alt: string; height: number; width: number; cardBg?: string };
  h1: React.ReactNode;
  intro: React.ReactNode;
  rows: ComparativaRow[];
  /** Párrafo corto: para qué estudio concreto tiene sentido cada opción. Sintetiza `rows`, no añade datos nuevos del competidor. */
  veredicto: React.ReactNode;
  footnote: string;
  /** Preguntas que la gente hace de VERDAD sobre este competidor («¿cuánto cuesta?», «¿alternativas?»). Opcional: sin ellas no se pinta ni se declara nada. */
  faq?: { q: string; a: string }[];
  ctaBody?: string;
}) {
  const relacionadas = relacionadasDe(`/comparativa/${slug}`);
  const pagina = paginaDe(`/comparativa/${slug}`);
  // Fecha de la última revisión de los datos del competidor (del registro): se ve
  // en pantalla Y se declara en el JSON-LD. Un comparativa sin fecha es una
  // afirmación sin caducidad, y es lo primero que un buscador con IA desconfía.
  const revisada = pagina?.actualizado;
  const revisadaTexto = revisada ? new Date(`${revisada}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const webPageLd = pagina ? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pagina.titulo,
    description: pagina.descripcion,
    url: `${LEGAL.url}/comparativa/${slug}`,
    inLanguage: 'es-ES',
    ...(revisada ? { dateModified: revisada } : {}),
    isPartOf: { '@id': `${LEGAL.url}/#web` },
    publisher: { '@id': ID_ORGANIZACION },
    about: { '@type': 'SoftwareApplication', name: 'Tentare', url: LEGAL.url },
    mentions: { '@type': 'SoftwareApplication', name },
  } : null;
  return (
    <PageShell>
      <OrganizationStructuredData />
      <ComparativaBreadcrumb slug={slug} name={`Tentare vs ${name}`} />
      {webPageLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd).replace(/</g, '\\u003c') }} />}
      {faq && faq.length > 0 && <FaqStructuredData items={faq} />}
      {/* La vuelta lleva a la home: quien llega aquí desde Google no viene de
          la comparativa general, y «volver» a ella no le enseña el producto. */}
      <SiteNav backHref="/" backLabel="Inicio" />

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
          <p className="cmp1-kicker"><span aria-hidden>★</span> El software Nº1 para estudios de Pilates</p>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>{h1}</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>{intro}</p>
          <div className="cmp1-ctas">
            <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--pri">Probar 7 días gratis →</Link>
            <Link href="/precios" className="cmp1-btn cmp1-btn--sec">Ver precios</Link>
          </div>
          <p className="cmp1-confianza">
            <a href={G2_URL} target="_blank" rel="noopener noreferrer"><span className="cmp1-estrellas" aria-hidden>★★★★★</span> {G2_NOTA} en G2</a>
            <span aria-hidden>·</span> Sin tarjeta <span aria-hidden>·</span> Sin permanencia
          </p>
          {revisadaTexto && <p className="lp-mono" style={{ fontSize: 12, color: '#6B6B63', margin: '14px 0 0' }}>Datos del competidor revisados el {revisadaTexto}</p>}
        </div>
      </header>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(36px,5vw,56px)' }}>
        <div className="cmp1-porque" style={{ maxWidth: 900, margin: '0 auto' }}>
          {POR_QUE.map((p, i) => (
            <Reveal key={p.titulo} delay={i * 60} className="cmp1-porque-card">
              <span className="cmp1-porque-num" aria-hidden>{i + 1}</span>
              <h2 className="cmp1-porque-titulo">{p.titulo}</h2>
              <p className="cmp1-porque-texto">{p.texto}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 60px -44px rgba(26,26,26,.3)' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 11, fontWeight: 600, color: '#6B6B63', textTransform: 'uppercase', letterSpacing: '.06em', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>Para tu estudio</th>
                  <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 13, fontWeight: 800, color: '#fff', background: ACC, borderBottom: `1px solid ${ACC}` }}>Tentare</th>
                  <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>{name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.feature}>
                    <td style={{ padding: '15px 20px', fontSize: 14, fontWeight: 600, borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}>{r.feature}</td>
                    <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#1A1A1A', background: '#F7F8F1', borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.tentare[0]} label={r.tentare[1]} /></td>
                    <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < rows.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.them[0]} label={r.them[1]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <p className="lp-mono" style={{ fontSize: 11, color: '#6B6B63', margin: '16px 4px 0', lineHeight: 1.6 }}>{footnote}</p>
          <div className="cmp1-mitad">
            <p>¿Lo ves claro? Compruébalo con tu estudio: 7 días gratis, sin tarjeta.</p>
            <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--pri">Empezar gratis →</Link>
          </div>
        </div>
      </section>

      <section style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <Reveal style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', margin: '0 0 16px' }}>Nuestro veredicto</p>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.2vw,46px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 18px', color: '#fff' }}>Tentare, el Nº1 para tu estudio de Pilates.</h2>
          <p style={{ fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.6, color: MUTED_DARK, margin: '0 0 28px' }}>{veredicto}</p>
          <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--claro">Probar 7 días gratis →</Link>
        </Reveal>
      </section>

      {relacionadas.length > 0 && (
        <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6B6B63', margin: '0 0 18px' }}>Sigue por aquí</h2>
            <div className="cmp1-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="cmp1-rel-card">
                  <span className="cmp1-rel-nombre">{r.etiqueta}</span>
                  <span className="cmp1-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {faq && faq.length > 0 && (
        <section style={{ padding: 'clamp(48px,6vw,72px) clamp(20px,4vw,44px) 0' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6B6B63', margin: '0 0 16px' }}>Lo que se pregunta sobre {name}</h2>
            <ArticleFaq items={faq} />
          </div>
        </section>
      )}

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Compruébalo con tu propio estudio." body={ctaBody} />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .cmp1-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 760px) { .cmp1-two { grid-template-columns: 1fr; } }
        .cmp1-kicker { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 16px; padding: 7px 14px;
          border-radius: 999px; background: ${ACC}; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .01em; }
        .cmp1-kicker span { color: #E3C66B; }
        .cmp1-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin: 26px 0 0; }
        .cmp1-btn { display: inline-block; font-size: 16px; font-weight: 700; padding: 15px 28px; border-radius: 999px;
          text-decoration: none; transition: transform .18s ease, filter .18s ease; }
        .cmp1-btn:hover { transform: translateY(-2px); }
        .cmp1-btn--pri { background: ${ACC}; color: #fff; box-shadow: 0 14px 28px -12px rgba(52,56,37,.55); }
        .cmp1-btn--pri:hover { filter: brightness(1.12); }
        .cmp1-btn--sec { background: #fff; color: #1A1A1A; border: 1px solid #DAD9D0; }
        .cmp1-btn--claro { background: #fff; color: ${ACC}; }
        .cmp1-confianza { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0 0; font-size: 13.5px; color: ${MUTED}; }
        .cmp1-confianza a { color: #1A1A1A; font-weight: 700; text-decoration: none; }
        .cmp1-confianza a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .cmp1-estrellas { color: #D9A520; letter-spacing: 1px; }
        .cmp1-porque { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        @media (max-width: 760px) { .cmp1-porque { grid-template-columns: 1fr; } }
        .cmp1-porque-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 22px;
          box-shadow: 0 20px 40px -34px rgba(26,26,26,.35); }
        .cmp1-porque-num { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
          border-radius: 50%; background: ${ACC_SOFT}; color: ${ACC}; font-weight: 800; font-size: 14px; margin-bottom: 12px; }
        .cmp1-porque-titulo { font-size: 17px; font-weight: 800; letter-spacing: -.01em; line-height: 1.25; margin: 0 0 8px; color: #1A1A1A; }
        .cmp1-porque-texto { font-size: 14px; line-height: 1.55; color: ${MUTED}; margin: 0; }
        .cmp1-mitad { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;
          margin: 28px 0 0; padding: 20px 24px; border-radius: 18px; background: ${ACC_SOFT}; border: 1px solid #E0E3D2; }
        .cmp1-mitad p { margin: 0; font-size: 16px; font-weight: 700; color: #1A1A1A; }
        @media (prefers-reduced-motion: reduce) { .cmp1-btn { transition: none; } }
        .cmp1-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .cmp1-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .cmp1-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .cmp1-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
        .cmp1-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
        @media (max-width: 760px) { .cmp1-rel { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .cmp1-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
