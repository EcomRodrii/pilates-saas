import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { ACC, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/comparativa';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: pagina.titulo,
    description: 'Las diferencias que se notan cada día y cada fin de mes en un estudio de Pilates en España.',
    url: urlDe(PATH),
    images: [{ url: '/comparativa/opengraph-image' }],
  },
};

// Mismo orden que las columnas de la tabla ROWS de abajo (bsport, momence,
// eversports, mindbody, timp, lorari, bonsai, glofox, viday, gesyoga,
// bookyway, deporweb, flowstark) — si se reordena aquí, hay que reordenar
// las celdas del <tbody> también, o la cabecera deja de casar con los datos.
//
// Los últimos 5 (ViDay, GesYoga, BookyWay, DeporWeb, Flowstark) no son los
// competidores "conocidos" habituales — son los que de verdad aparecen en
// el SERP español para "gestión pilates"/"gestión centros de pilates", las
// únicas 2 queries con volumen real en Search Console verificadas el
// 20-ago-2026. Se añadieron tras esa auditoría, no antes.
const COMPETITORS = [
  { slug: 'tentare-vs-bsport', name: 'bsport' },
  { slug: 'tentare-vs-momence', name: 'Momence' },
  { slug: 'tentare-vs-eversports', name: 'Eversports' },
  { slug: 'tentare-vs-mindbody', name: 'Mindbody' },
  { slug: 'tentare-vs-timp', name: 'TIMP' },
  { slug: 'tentare-vs-lorari', name: 'Lorari' },
  { slug: 'tentare-vs-bonsai', name: 'Bonsai' },
  { slug: 'tentare-vs-glofox', name: 'Glofox' },
  { slug: 'tentare-vs-viday', name: 'ViDay' },
  { slug: 'tentare-vs-gesyoga', name: 'GesYoga' },
  { slug: 'tentare-vs-bookyway', name: 'BookyWay' },
  { slug: 'tentare-vs-deporweb', name: 'DeporWeb' },
  { slug: 'tentare-vs-flowstark', name: 'Flowstark' },
];

type Verdict = 'yes' | 'no' | 'partial';

function Mark({ v, label }: { v: Verdict; label: string }) {
  const color = v === 'yes' ? '#4E9E7F' : v === 'no' ? '#C2503A' : '#C79A2E';
  const symbol = v === 'yes' ? '✓' : v === 'no' ? '✗' : '≈';
  return <><span style={{ color, fontWeight: 800 }}>{symbol}</span> {label}</>;
}

// Cada celda es lo que CONSTA en la web pública del competidor, con la fecha de
// la revisión (23-sep-2026) y la fuente en su página 1 a 1. «No consta» significa
// que su web pública no lo indica: no que no exista, y nunca se rellena con «sí»
// ni con «no». Una versión anterior de esta tabla atribuía a los competidores
// contratos anuales, comisiones y sedes de alojamiento que nadie había
// comprobado; eso no vuelve a entrar. Glofox: su columna sale de nuestra guía
// (texto del fundador) y solo lleva lo que ella dice.
const ROWS: {
  feature: string;
  tentare: [Verdict, string];
  bsport: [Verdict, string];
  momence: [Verdict, string];
  eversports: [Verdict, string];
  mindbody: [Verdict, string];
  timp: [Verdict, string];
  lorari: [Verdict, string];
  bonsai: [Verdict, string];
  glofox: [Verdict, string];
  viday: [Verdict, string];
  gesyoga: [Verdict, string];
  bookyway: [Verdict, string];
  deporweb: [Verdict, string];
  flowstark: [Verdict, string];
}[] = [
  {
    feature: 'Precio público en la web',
    tentare: ['yes', 'Desde 29 €/mes, IVA incluido'],
    bsport: ['no', 'Pide presupuesto'],
    momence: ['no', 'Pide hablar con ellos'],
    eversports: ['yes', 'Desde 33 €/mes + IVA'],
    mindbody: ['partial', 'Desde 99 €/mes por ubicación'],
    timp: ['yes', 'Desde 50 €/mes'],
    lorari: ['yes', 'Desde 12 €/mes + IVA'],
    bonsai: ['yes', 'Gratis (3 % extra) o 29 €/mes + IVA'],
    glofox: ['partial', 'Desde 99 USD/mes'],
    viday: ['yes', 'Desde 39 €/mes + IVA'],
    gesyoga: ['yes', 'Desde 12 €/mes + IVA'],
    bookyway: ['partial', '1,50 € por usuario adicional'],
    deporweb: ['no', 'No publica cifras'],
    flowstark: ['yes', 'Gratis (50 clientes) o 19 €/mes'],
  },
  {
    feature: 'Sin permanencia',
    tentare: ['yes', 'Sí, mes a mes'],
    bsport: ['partial', 'No consta'],
    momence: ['partial', 'No consta'],
    eversports: ['partial', 'No consta; el plan anual se factura por año'],
    mindbody: ['partial', 'Depende del plan'],
    timp: ['partial', 'Mínimo de 3 meses en la mayoría de planes'],
    lorari: ['yes', 'Cancela cuando quieras'],
    bonsai: ['partial', 'Mensual sin compromiso; anual por adelantado'],
    glofox: ['partial', 'Anual o trimestral habitual (según nuestra guía)'],
    viday: ['yes', 'Sí'],
    gesyoga: ['partial', 'No consta'],
    bookyway: ['yes', 'Sin suscripción'],
    deporweb: ['partial', 'No consta'],
    flowstark: ['yes', 'Cancela cuando quieras'],
  },
  {
    feature: 'Facturación España (Veri*factu)',
    tentare: ['partial', 'Sí; envío a la AEAT en desarrollo'],
    bsport: ['partial', 'No consta'],
    momence: ['partial', 'No consta'],
    eversports: ['yes', 'Extensión con fiskaly'],
    mindbody: ['partial', 'No consta'],
    timp: ['yes', 'Sí, con TicketBAI'],
    lorari: ['partial', 'No consta'],
    bonsai: ['partial', 'No consta'],
    glofox: ['partial', 'No consta'],
    viday: ['yes', 'Sí, con TicketBAI'],
    gesyoga: ['yes', 'Sí (en modo ERP)'],
    bookyway: ['partial', 'No consta'],
    deporweb: ['partial', 'Artículos y webinars; no consta certificación'],
    flowstark: ['partial', 'No consta'],
  },
  {
    feature: 'Datos alojados en la UE',
    tentare: ['yes', 'Sí'],
    bsport: ['partial', 'No consta'],
    momence: ['partial', 'No consta'],
    eversports: ['partial', 'No consta'],
    mindbody: ['partial', 'No consta'],
    timp: ['partial', 'No consta'],
    lorari: ['partial', 'No consta'],
    bonsai: ['yes', 'Servidores en la UE, según sus condiciones'],
    glofox: ['partial', 'No consta'],
    viday: ['partial', 'No consta'],
    gesyoga: ['partial', 'No consta'],
    bookyway: ['partial', 'No consta'],
    deporweb: ['partial', 'No consta'],
    flowstark: ['partial', 'No consta'],
  },
  {
    feature: 'Comisión por clientas nuevas del marketplace',
    tentare: ['yes', 'Sin marketplace'],
    bsport: ['partial', 'No consta'],
    momence: ['yes', 'Sin marketplace'],
    eversports: ['yes', 'Sin comisión por reservas de su app o web'],
    mindbody: ['partial', '20 % (tope 30 $) en la 1.ª compra'],
    timp: ['partial', 'TIMPY: comisión sin porcentaje público'],
    lorari: ['partial', 'No consta'],
    bonsai: ['partial', 'No consta'],
    glofox: ['partial', 'No consta'],
    viday: ['partial', 'No consta'],
    gesyoga: ['partial', 'No consta'],
    bookyway: ['yes', 'No es un agregador'],
    deporweb: ['partial', 'No consta'],
    flowstark: ['partial', 'No consta'],
  },
  {
    feature: 'Sustitución de instructoras',
    tentare: ['yes', 'Con tu visto bueno; autónoma en el plan Estudio'],
    bsport: ['yes', 'Sustituciones automáticas'],
    momence: ['yes', 'Automatiza sustituciones'],
    eversports: ['yes', 'Gestión de sustituciones'],
    mindbody: ['partial', 'No consta'],
    timp: ['partial', 'No consta'],
    lorari: ['partial', 'No consta'],
    bonsai: ['partial', 'No consta'],
    glofox: ['partial', 'No consta'],
    viday: ['partial', 'No consta'],
    gesyoga: ['partial', 'No consta'],
    bookyway: ['partial', 'No consta'],
    deporweb: ['partial', 'No consta'],
    flowstark: ['partial', 'No consta'],
  },
  {
    feature: 'Elegir plaza o reformer al reservar',
    tentare: ['yes', 'Si la sala tiene sus puestos definidos'],
    bsport: ['partial', 'No consta'],
    momence: ['yes', 'Spot scheduling'],
    eversports: ['yes', 'Spot booking'],
    mindbody: ['yes', 'Pick-a-Spot (plan Accelerate)'],
    timp: ['partial', 'No consta'],
    lorari: ['partial', 'No consta'],
    bonsai: ['partial', 'No consta'],
    glofox: ['partial', 'No consta'],
    viday: ['partial', 'No consta'],
    gesyoga: ['partial', 'No consta'],
    bookyway: ['partial', 'No consta'],
    deporweb: ['partial', 'No consta'],
    flowstark: ['partial', 'No consta'],
  },
];

export default function ComparativaPage() {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path="/comparativa" name="Comparativa" />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Comparativa</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Tentare frente a los 13 software con los que más se compara.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>No somos mejores en todo — y te lo contamos abajo, sin rodeos. Pero para un <strong style={{ color: '#1A1A1A' }}>estudio de pilates en España</strong>, hay diferencias que se notan cada día y cada fin de mes.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 60px -44px rgba(26,26,26,.3)' }}>
            <div className="cmp-hint lp-mono" style={{ display: 'none', alignItems: 'center', gap: 7, padding: '12px 16px 0', fontSize: 11, color: '#A8A89F' }}>
              Desliza la tabla para ver todo
              <ArrowRight size={14} />
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: 1360, borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '18px 20px', fontSize: 11, fontWeight: 600, color: '#8E8E86', textTransform: 'uppercase', letterSpacing: '.06em', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0', minWidth: 210 }}>Para tu estudio</th>
                    <th style={{ textAlign: 'left', padding: '18px 16px', fontSize: 13, fontWeight: 800, color: '#fff', background: ACC, borderBottom: `1px solid ${ACC}` }}>Tentare</th>
                    {COMPETITORS.map((c) => (
                      <th key={c.slug} style={{ textAlign: 'left', padding: '18px 16px', fontSize: 12.5, fontWeight: 700, color: '#5A5A52', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0' }}>{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={r.feature}>
                      <td style={{ padding: '15px 20px', fontSize: 14, fontWeight: 600, borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}>{r.feature}</td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#1A1A1A', background: '#F7F8F1', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.tentare[0]} label={r.tentare[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.bsport[0]} label={r.bsport[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.momence[0]} label={r.momence[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.eversports[0]} label={r.eversports[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.mindbody[0]} label={r.mindbody[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.timp[0]} label={r.timp[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.lorari[0]} label={r.lorari[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.bonsai[0]} label={r.bonsai[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.glofox[0]} label={r.glofox[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.viday[0]} label={r.viday[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.gesyoga[0]} label={r.gesyoga[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.bookyway[0]} label={r.bookyway[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.deporweb[0]} label={r.deporweb[1]} /></td>
                      <td style={{ padding: '15px 16px', fontSize: 12.5, color: '#5A5A52', borderBottom: i < ROWS.length - 1 ? '1px solid #EDEDE6' : undefined }}><Mark v={r.flowstark[0]} label={r.flowstark[1]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <p className="lp-mono" style={{ fontSize: 11, color: '#6B6B63', margin: '16px 4px 0', lineHeight: 1.6 }}>Basado en la información pública de cada proveedor a 23 de septiembre de 2026, con la fuente en cada página 1 a 1 de abajo. «No consta» significa que su web pública no lo indica, no que no exista. Las funciones y precios cambian con el tiempo; verifica siempre con la fuente actual. bsport, Momence, Eversports, Mindbody, TIMP, Lorari, Bonsai, Glofox, ViDay, GesYoga, BookyWay, DeporWeb y Flowstark son marcas de sus respectivos propietarios; esta comparación es orientativa y sin ánimo de menoscabo.</p>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6B6B63', marginBottom: 16 }}>Comparativa 1 a 1</Reveal>
          <div className="cmp-links">
            {COMPETITORS.map((c, i) => (
              <Reveal key={c.slug} delay={i * 40}>
                <a href={`/comparativa/${c.slug}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '18px 20px', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700 }}>
                    Tentare vs {c.name}
                  </span>
                  <span style={{ color: '#A8A89F', fontSize: 15 }}>→</span>
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: '#0F0F0F', color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 16 }}>Con honestidad</Reveal>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.8vw,42px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 28px', color: '#fff' }}>En qué aún no somos los mejores.</h2></Reveal>
          <div className="cmp-two">
            <Reveal style={{ background: '#171717', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>App nativa para tus alumnas</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Hoy tus alumnas usan una app web (funciona en cualquier móvil, sin pasar por la App Store). Bsport, Eversports, Mindbody y otros ofrecen apps propias para los clientes del estudio; la de Tentare se instala desde el navegador, con el nombre y el icono de tu estudio, pero no está en las tiendas de aplicaciones.</p>
            </Reveal>
            <Reveal delay={90} style={{ background: '#171717', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Un marketplace que te traiga clientas</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Mindbody y Eversports tienen su propio marketplace de captación (Mindbody cobra hasta un 20 %, con tope, en la primera compra de cada clienta nueva). Tentare no tiene marketplace, y tampoco cobra comisión por clienta nueva.</p>
            </Reveal>
          </div>
          <Reveal><p style={{ fontSize: 15, lineHeight: 1.6, color: '#A6A69E', margin: '24px 0 0' }}>Preferimos decírtelo antes de que lo descubras. Si algo de esto es imprescindible para ti hoy, escríbenos antes de probar y te decimos con franqueza si Tentare te sirve.</p></Reveal>
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Compruébalo con tu propio estudio." body="Te ayudamos a traer tus datos. Sin permanencia. Sin sorpresas." />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/recursos', label: 'Recursos' }, { href: '/seguridad', label: 'Seguridad' }]} />

      <style>{`
        .cmp-two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .cmp-links { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        @media (max-width: 900px) { .cmp-links { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .cmp-links { grid-template-columns: 1fr; } }
        @media (max-width: 760px) {
          .cmp-two { grid-template-columns: 1fr; }
          .cmp-hint { display: flex !important; }
        }
      `}</style>
    </PageShell>
  );
}
